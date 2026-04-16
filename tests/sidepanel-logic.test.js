/**
 * sidepanel-logic.test.js — B-054 Sidepanel Shell (automated subset)
 *
 * sidepanel.js is a browser-only module (DOM side-effects on load; no exports).
 * The pure helpers — avatarColor hash and group-sort logic — are inlined into
 * sidepanel.js and therefore cannot be imported directly without a DOM.
 *
 * Strategy: the functions are small enough to be reproduced verbatim here for
 * unit testing.  Each reproduction is marked with a comment that ties it back
 * to the source location so future refactors are obvious.
 *
 * FINDING: sidepanel.js has no exports and triggers DOM queries at module
 * evaluation time.  Recommend extracting the three pure helpers below into
 * `sidepanel/helpers.js` (exported, no side-effects) so they can be imported
 * directly.  See recommendations in UAT document.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Reproduced pure helpers (verbatim from sidepanel/sidepanel.js)
   Source: sidepanel.js lines 62-74 (avatarColor)
          sidepanel.js lines 102-115 (group sort / sub-group nesting logic)
          sidepanel.js lines 45-48  (applyTheme resolution)
   ========================================================================= */

const AVATAR_PALETTE = [
  '#2563eb', '#7c3aed', '#0d9488', '#dc2626',
  '#ea580c', '#db2777', '#4f46e5', '#ca8a04',
  '#64748b', '#059669', '#9333ea', '#0284c7',
];

/** Reproduced from sidepanel.js avatarColor() */
function avatarColor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/** Reproduced from sidepanel.js applyTheme() — the resolution/validation step only */
function resolveTheme(theme) {
  return (theme === 'light' || theme === 'dark') ? theme : 'system';
}

/**
 * Reproduced from sidepanel.js renderAll() group-sort logic (lines 103-115).
 * Returns { rootGroups, childGroupsByParent } given a raw groups array.
 */
function sortAndNestGroups(groups) {
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

  return { rootGroups, childGroupsByParent };
}

/* =========================================================================
   AC5 — Letter-avatar hash (deterministic, palette-bounded)
   ========================================================================= */

test('AC5: avatarColor returns a palette colour string for any non-empty title', () => {
  const colour = avatarColor('GitHub');
  assert.ok(AVATAR_PALETTE.includes(colour), `Expected a palette colour, got ${colour}`);
});

test('AC5: avatarColor is deterministic — same input always produces same colour', () => {
  assert.equal(avatarColor('Example Domain'), avatarColor('Example Domain'));
  assert.equal(avatarColor('a'), avatarColor('a'));
  assert.equal(avatarColor('Z'), avatarColor('Z'));
});

test('AC5: avatarColor does not throw on empty string', () => {
  assert.doesNotThrow(() => avatarColor(''));
  assert.ok(AVATAR_PALETTE.includes(avatarColor('')));
});

test('AC5: avatarColor produces different results for meaningfully different titles', () => {
  // Not guaranteed for all pairs but reliable for these examples:
  const results = new Set(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map(avatarColor));
  // At least 2 distinct colours among 5 diverse titles (pigeonhole upper-bound = 5 out of 12)
  assert.ok(results.size >= 2, 'Expected at least 2 distinct colours for 5 different titles');
});

test('AC5: avatarColor index is always within palette bounds', () => {
  const titles = [
    '', 'a', 'Z', 'GitHub', 'Stack Overflow', 'very long title that goes on and on and on',
    '123', '!@#$', '\u00e9l\u00e8ve', // accented chars
  ];
  for (const t of titles) {
    const colour = avatarColor(t);
    assert.ok(AVATAR_PALETTE.includes(colour), `Out-of-bounds colour "${colour}" for title "${t}"`);
  }
});

/* =========================================================================
   AC3/AC4 — Group sorting and sub-group nesting logic
   ========================================================================= */

test('AC3: root groups are sorted by sortOrder ascending', () => {
  const groups = [
    { id: 'g2', name: 'B', sortOrder: 2, parentId: null },
    { id: 'g1', name: 'A', sortOrder: 1, parentId: null },
    { id: 'g3', name: 'C', sortOrder: 3, parentId: null },
  ];
  const { rootGroups } = sortAndNestGroups(groups);
  assert.equal(rootGroups[0].id, 'g1');
  assert.equal(rootGroups[1].id, 'g2');
  assert.equal(rootGroups[2].id, 'g3');
});

test('AC3: all root groups appear in rootGroups, none in childGroupsByParent', () => {
  const groups = [
    { id: 'g1', name: 'A', sortOrder: 1, parentId: null },
    { id: 'g2', name: 'B', sortOrder: 2, parentId: null },
  ];
  const { rootGroups, childGroupsByParent } = sortAndNestGroups(groups);
  assert.equal(rootGroups.length, 2);
  assert.equal(childGroupsByParent.size, 0);
});

test('AC4: sub-groups with parentId are nested under their parent, not in rootGroups', () => {
  const groups = [
    { id: 'parent', name: 'Parent', sortOrder: 1, parentId: null },
    { id: 'child', name: 'Child', sortOrder: 1, parentId: 'parent' },
  ];
  const { rootGroups, childGroupsByParent } = sortAndNestGroups(groups);
  assert.equal(rootGroups.length, 1);
  assert.equal(rootGroups[0].id, 'parent');
  assert.ok(childGroupsByParent.has('parent'));
  assert.equal(childGroupsByParent.get('parent')[0].id, 'child');
});

test('AC4: multiple sub-groups under same parent are all captured', () => {
  const groups = [
    { id: 'p', name: 'Parent', sortOrder: 0, parentId: null },
    { id: 'c1', name: 'Child1', sortOrder: 2, parentId: 'p' },
    { id: 'c2', name: 'Child2', sortOrder: 1, parentId: 'p' },
  ];
  const { rootGroups, childGroupsByParent } = sortAndNestGroups(groups);
  assert.equal(rootGroups.length, 1);
  const children = childGroupsByParent.get('p');
  assert.equal(children.length, 2);
  // Children should themselves be sorted by sortOrder
  assert.equal(children[0].id, 'c2'); // sortOrder:1 first
  assert.equal(children[1].id, 'c1'); // sortOrder:2 second
});

test('AC3: groups with missing sortOrder default to 0', () => {
  const groups = [
    { id: 'g2', name: 'B', parentId: null },           // no sortOrder
    { id: 'g1', name: 'A', sortOrder: 0, parentId: null },
  ];
  const { rootGroups } = sortAndNestGroups(groups);
  // Both are sortOrder 0 — order among ties is stable but both must appear
  assert.equal(rootGroups.length, 2);
});

test('AC4: sub-group with unknown parentId does not appear in rootGroups', () => {
  const groups = [
    { id: 'orphan', name: 'Orphan', sortOrder: 1, parentId: 'nonexistent-parent' },
  ];
  const { rootGroups, childGroupsByParent } = sortAndNestGroups(groups);
  // Orphan has a parentId so it goes into childGroupsByParent, not rootGroups
  assert.equal(rootGroups.length, 0);
  assert.ok(childGroupsByParent.has('nonexistent-parent'));
});

/* =========================================================================
   AC13 — Theme resolution
   ========================================================================= */

test('AC13: resolveTheme("light") returns "light"', () => {
  assert.equal(resolveTheme('light'), 'light');
});

test('AC13: resolveTheme("dark") returns "dark"', () => {
  assert.equal(resolveTheme('dark'), 'dark');
});

test('AC13: resolveTheme("system") falls through to "system"', () => {
  assert.equal(resolveTheme('system'), 'system');
});

test('AC13: resolveTheme(undefined) falls through to "system"', () => {
  assert.equal(resolveTheme(undefined), 'system');
});

test('AC13: resolveTheme("") falls through to "system"', () => {
  assert.equal(resolveTheme(''), 'system');
});

test('AC13: resolveTheme("DARK") is case-sensitive, falls to "system"', () => {
  assert.equal(resolveTheme('DARK'), 'system');
});
