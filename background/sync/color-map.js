/**
 * background/sync/color-map.js — TJ → Chrome tab-group color mapping.
 *
 * Pure module. No side effects. No chrome.* calls. No storage reads.
 *
 * Chrome tab groups support a fixed palette of 9 named colors:
 *   grey, blue, red, yellow, green, pink, purple, cyan, orange
 * (see https://developer.chrome.com/docs/extensions/reference/api/tabGroups#type-Color)
 *
 * TJ's GROUP_COLORS palette has 9 entries:
 *   blue, purple, teal, red, orange, pink, indigo, yellow, slate
 *
 * Of these 9, 6 are exact matches (blue, purple, red, orange, pink, yellow).
 * The remaining 3 are inexact:
 *   - teal   → cyan  (closest hue)
 *   - indigo → blue  (no Chrome indigo; blue is closest)
 *   - slate  → grey  (slate has no Chrome equivalent; grey reads as neutral)
 *
 * Chrome's `green` has no TJ equivalent and is unused by this mapping.
 * Used by background/sync/chrome-sync.js when calling chrome.tabGroups.update.
 */

/** Frozen set of valid Chrome tab group color names. */
export const CHROME_TAB_GROUP_COLORS = Object.freeze(new Set([
  'grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange',
]));

/** Static lookup table. Frozen for safety. */
const TJ_TO_CHROME = Object.freeze({
  blue: 'blue',
  purple: 'purple',
  teal: 'cyan',
  red: 'red',
  orange: 'orange',
  pink: 'pink',
  indigo: 'blue',
  yellow: 'yellow',
  slate: 'grey',
});

/**
 * Map a TJ group color (string from shared/constants.js GROUP_COLORS) to a
 * Chrome tab group color. Returns 'grey' for any unknown / falsy input — this
 * branch should not trigger in production because TJ validates writes against
 * GROUP_COLORS, but the fallback ensures we never pass an invalid color to
 * chrome.tabGroups.update (which would reject the call and abort the sync).
 *
 * @param {string} tjColor
 * @returns {'grey'|'blue'|'red'|'yellow'|'green'|'pink'|'purple'|'cyan'|'orange'}
 */
export function tjColorToChromeColor(tjColor) {
  if (typeof tjColor !== 'string') return 'grey';
  return TJ_TO_CHROME[tjColor] ?? 'grey';
}
