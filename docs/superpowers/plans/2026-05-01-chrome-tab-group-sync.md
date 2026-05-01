# Chrome tab group sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a single user action — "Sync this window to Chrome" in the Settings page — that snapshot-pushes TJ's window view into Chrome's tab strip and tab groups.

**Architecture:** New `background/sync/` module with two files (`chrome-sync.js` orchestrator + `color-map.js` palette mapping). Lazy schema migration v4→v5 adds optional `chromeTabGroupId` to TJ groups. New `MSG_SYNC_TO_CHROME` contract + SW handler. New "Chrome Integration" fieldset in `settings/settings.html` wires a button → SW → toast result. Push-only, snapshot-only, current-window-only this sprint; auto-sync deferred to S43.

**Tech Stack:** Vanilla JS ES modules, Chrome Extension MV3 (`chrome.tabs`, `chrome.tabGroups`, `chrome.windows`, `chrome.runtime`), node:test runner with `tests/chrome-mock.js`, no build step.

**Spec:** `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md` (commit `e15e8e1`).

**Baseline:** Branch off `release/v2`. Test count baseline: **1,826/1,826 PASS**. All tasks must keep this green.

**Note re permission:** `tabGroups` is **already in `manifest.json:6`** — no permission change required (it was added in a prior sprint as a forward-looking declaration). Verify with `grep tabGroups manifest.json` before R4 [security-reviewer] hand-off.

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `background/sync/chrome-sync.js` | Push orchestrator. Public: `syncToChrome(windowId)`. Internal helpers: `_computeTargetStripOrder`, `_resolveChromeGroup`, `_applyTabsToGroup`, `_buildSummary`. |
| `background/sync/color-map.js` | Pure `tjColorToChromeColor(tj: string): string`. Frozen lookup table. |
| `tests/sync-color-map.test.js` | Unit tests for color-map (10 cases incl. unknown-fallback). |
| `tests/sync-chrome-sync.test.js` | Integration tests for `syncToChrome` happy path + edge cases (8 cases). |

### Modified

| Path | Change |
|------|--------|
| `shared/messages.js` | Add `MSG_SYNC_TO_CHROME` constant. |
| `background/storage/migration.js` | Bump `KNOWN_VERSION` 4→5. Append v4→v5 no-op `MIGRATION_STEPS` entry. |
| `background/storage/shapes.js` | Bump `defaultShape(PARTITION_META).schemaVersion` to 5. Extend `isGroup` validator to tolerate optional `chromeTabGroupId`. |
| `background/messages/storage-handlers.js` | Add `case MSG_SYNC_TO_CHROME` dispatch (write-class, calls `syncToChrome`). |
| `background/messages/storage-handlers.js` | Register `MSG_SYNC_TO_CHROME` in `WRITE_MESSAGE_TYPES` set. |
| `tests/chrome-mock.js` | Add `chrome.tabGroups.{create,update,get,query}` mocks + extend `chrome.tabs.move` to accept array tabIds + add `chrome.tabs.group` and `chrome.tabs.ungroup`. |
| `settings/settings.html` | Add "Chrome Integration" fieldset with button. |
| `settings/settings.js` | Wire button click → `sendMessage(MSG_SYNC_TO_CHROME)` → result toast. |
| `manifest.json` | Bump `version` to `1.36.0` at sprint close. |

### Test count target

After all tasks complete: **+18 new tests** (~1,844 total). Per-task green checkpoint: full `npm test` run.

---

## Task 1: Branch creation + baseline confirmation

**Files:**
- None modified (branch + verification only)

- [ ] **Step 1: Verify on release/v2 with clean tree**

Run:
```bash
git status --short && git rev-parse --abbrev-ref HEAD
```
Expected: empty status, `release/v2` branch.

- [ ] **Step 2: Create feature branch**

Run:
```bash
git checkout -b feature/sprint-42-chrome-sync
```
Expected: `Switched to a new branch 'feature/sprint-42-chrome-sync'`.

- [ ] **Step 3: Confirm baseline test count**

Run:
```bash
npm test 2>&1 | tail -5
```
Expected: `tests 1826 / pass 1826 / fail 0`.

- [ ] **Step 4: Verify tabGroups permission is already declared**

Run:
```bash
grep -n tabGroups manifest.json
```
Expected: `6:  "permissions": ["tabs", "tabGroups", "storage", "sidePanel", "search"],`

- [ ] **Step 5: Commit nothing — branch creation alone (no commit needed)**

---

## Task 2: Add MSG_SYNC_TO_CHROME message constant

**Files:**
- Modify: `shared/messages.js` (append after existing groups section, around line 26)

- [ ] **Step 1: Write the failing test**

Create `tests/sync-message-constant.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';

test('MSG_SYNC_TO_CHROME constant is defined and uses tj/ namespace', () => {
  assert.equal(typeof MSG_SYNC_TO_CHROME, 'string');
  assert.match(MSG_SYNC_TO_CHROME, /^tj\//);
  assert.equal(MSG_SYNC_TO_CHROME, 'tj/syncToChrome');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-message-constant.test.js`
Expected: `SyntaxError` or import-resolution failure for `MSG_SYNC_TO_CHROME`.

- [ ] **Step 3: Add the constant**

Edit `shared/messages.js`. After the existing `MSG_GET_GROUP` line (around line 25), add a new section:

```js
// ---- Chrome integration (S42 / B-041) ----

/**
 * Snapshot-push the current window's TJ view into Chrome:
 * reorder the tab strip in TJ order, create/update Chrome tab groups for each
 * TJ group with live tabs, leave ungrouped Open Tabs ungrouped.
 *
 * Request:  { windowId: number }
 * Response: { ok: boolean, summary?: SyncSummary, error?: { code, message } }
 *
 * SyncSummary shape — see background/sync/chrome-sync.js.
 */
export const MSG_SYNC_TO_CHROME = 'tj/syncToChrome';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sync-message-constant.test.js`
Expected: `tests 1 / pass 1 / fail 0`.

- [ ] **Step 5: Run full suite and commit**

Run:
```bash
npm test 2>&1 | tail -3
```
Expected: `tests 1827 / pass 1827 / fail 0` (+1 new test).

```bash
git add shared/messages.js tests/sync-message-constant.test.js
git commit -m "feat: S42 — add MSG_SYNC_TO_CHROME message constant

First foundational change for B-041 chrome tab group sync. Adds the message
contract; SW handler + UI wiring follow in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Schema bump v4 → v5 + chromeTabGroupId validator

**Files:**
- Modify: `background/storage/migration.js:89` (`KNOWN_VERSION` constant)
- Modify: `background/storage/migration.js:104-141` (`MIGRATION_STEPS` array)
- Modify: `background/storage/shapes.js:111` (`defaultShape(PARTITION_META)` schemaVersion)
- Modify: `background/storage/shapes.js:140-146` (`isGroup` validator)

- [ ] **Step 1: Write the failing test**

Create `tests/sync-schema-v5.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';
import { defaultShape, PARTITION_META, assertShape, PARTITION_GROUPS } from '../background/storage/shapes.js';

test('KNOWN_VERSION is 5', () => {
  assert.equal(KNOWN_VERSION, 5);
});

test('defaultShape(PARTITION_META) seeds schemaVersion: 5', () => {
  const shape = defaultShape(PARTITION_META);
  assert.equal(shape.schemaVersion, 5);
});

test('isGroup accepts a group without chromeTabGroupId (legacy v4 shape)', () => {
  const groups = [{
    id: '01',
    name: 'g',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup accepts a group with chromeTabGroupId: number (v5 shape)', () => {
  const groups = [{
    id: '01',
    name: 'g',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
    chromeTabGroupId: 42,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup accepts chromeTabGroupId: null (cleared after stale-mapping detect)', () => {
  const groups = [{
    id: '01', name: 'g', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
    chromeTabGroupId: null,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup rejects chromeTabGroupId of wrong type (string)', () => {
  const groups = [{
    id: '01', name: 'g', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
    chromeTabGroupId: 'not-a-number',
  }];
  assert.throws(() => assertShape(PARTITION_GROUPS, groups));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-schema-v5.test.js`
Expected: `KNOWN_VERSION is 5` fails (returns 4).

- [ ] **Step 3: Bump KNOWN_VERSION**

Edit `background/storage/migration.js:89`:

```js
export const KNOWN_VERSION = 5;
```

- [ ] **Step 4: Append v4→v5 no-op MIGRATION_STEPS entry**

Edit `background/storage/migration.js`. After the existing v3→v4 entry (around line 141), append:

```js
  /* B-041 §3.3 (S42) — v4 → v5 governance bump. No-op migrate: lazy data
     migration (option 2). `tj:groups` records gain an OPTIONAL
     `chromeTabGroupId: number | null` used by chrome-sync to remember which
     Chrome tab group corresponds to which TJ group across re-sync calls.
     Legacy v4 records lacking the field are treated as never-synced; the
     first sync stamps the field. The governance bump is required by C-1a
     even when the data migration is lazy (C-1b option 2). */
  {
    fromVersion: 4,
    toVersion: 5,
    migrate: (snapshot) => snapshot,
  },
```

Inside the array, before the closing `];`.

- [ ] **Step 5: Bump defaultShape schemaVersion**

Edit `background/storage/shapes.js:111`:

```js
      return { schemaVersion: 5, createdAt: Date.now() };
```

Update the comment block above (line 95-110) to add a v5 history note:
```js
         History: v1→v2 (B-121 §60.4.7) added floatingTabId + parentItemId.
         v2→v3 (B-134 §63.2.3) adds OPTIONAL `sortOrder` to PARTITION_FLOATING_GROUPS …
         v3→v4 (B-137 §66.2) adds OPTIONAL `liveTabId` to PARTITION_FLOATING_GROUPS …
         v4→v5 (B-041 S42 §3.3) adds OPTIONAL `chromeTabGroupId: number | null`
         to PARTITION_GROUPS records; data migration is lazy (legacy records
         lack the field; first sync stamps it; stale mappings are cleared
         transparently). */
```

- [ ] **Step 6: Extend isGroup validator**

Edit `background/storage/shapes.js:140-146`. Replace `isGroup` with:

```js
function isGroup(v) {
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.name) || !isString(v.color)) return false;
  if (!isNullableString(v.parentId)) return false;
  if (!isNumber(v.sortOrder) || !isBool(v.collapsed)) return false;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  /* B-041 (S42 §3.3) — OPTIONAL v5 field. Legacy v4 groups lack it; new writes
     stamp it on first sync; null is valid (cleared after stale-mapping detect).
     Anything else is corrupt. */
  if ('chromeTabGroupId' in v
    && v.chromeTabGroupId !== null
    && !isNumber(v.chromeTabGroupId)) return false;
  return true;
}
```

- [ ] **Step 7: Run new tests**

Run: `node --test tests/sync-schema-v5.test.js`
Expected: `tests 6 / pass 6 / fail 0`.

- [ ] **Step 8: Run full suite to confirm zero regressions**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1833 / pass 1833 / fail 0` (+6 new). Migration chain assertion still passes (v1→v2→v3→v4→v5 contiguous).

- [ ] **Step 9: Commit**

```bash
git add background/storage/migration.js background/storage/shapes.js tests/sync-schema-v5.test.js
git commit -m "feat: S42 — schema v4→v5 bump for chromeTabGroupId

Adds OPTIONAL chromeTabGroupId: number | null to TJ group records. Lazy
data migration per C-1b option 2; governance bump per C-1a (KNOWN_VERSION
+ defaultShape both move to v5). Validator tolerates legacy v4 groups
without the field, accepts v5 groups with number | null, rejects other
types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Color map module (TDD)

**Files:**
- Create: `background/sync/color-map.js`
- Create: `tests/sync-color-map.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sync-color-map.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tjColorToChromeColor, CHROME_TAB_GROUP_COLORS } from '../background/sync/color-map.js';

test('exact-match TJ colors map to same Chrome colors', () => {
  assert.equal(tjColorToChromeColor('blue'), 'blue');
  assert.equal(tjColorToChromeColor('purple'), 'purple');
  assert.equal(tjColorToChromeColor('red'), 'red');
  assert.equal(tjColorToChromeColor('orange'), 'orange');
  assert.equal(tjColorToChromeColor('pink'), 'pink');
  assert.equal(tjColorToChromeColor('yellow'), 'yellow');
});

test('teal maps to cyan', () => {
  assert.equal(tjColorToChromeColor('teal'), 'cyan');
});

test('indigo maps to blue', () => {
  assert.equal(tjColorToChromeColor('indigo'), 'blue');
});

test('slate maps to grey', () => {
  assert.equal(tjColorToChromeColor('slate'), 'grey');
});

test('unknown color falls back to grey (defensive)', () => {
  assert.equal(tjColorToChromeColor('chartreuse'), 'grey');
  assert.equal(tjColorToChromeColor(''), 'grey');
  assert.equal(tjColorToChromeColor(null), 'grey');
  assert.equal(tjColorToChromeColor(undefined), 'grey');
});

test('CHROME_TAB_GROUP_COLORS exports the canonical set', () => {
  assert.deepEqual(
    [...CHROME_TAB_GROUP_COLORS].sort(),
    ['blue', 'cyan', 'green', 'grey', 'orange', 'pink', 'purple', 'red', 'yellow'].sort(),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-color-map.test.js`
Expected: import error — module does not exist.

- [ ] **Step 3: Create the module**

Create `background/sync/color-map.js`:
```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sync-color-map.test.js`
Expected: `tests 6 / pass 6 / fail 0`.

- [ ] **Step 5: Run full suite and commit**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1839 / pass 1839 / fail 0` (+6).

```bash
git add background/sync/color-map.js tests/sync-color-map.test.js
git commit -m "feat: S42 — add TJ→Chrome color mapping module

Pure-function map from TJ's 9-color palette (GROUP_COLORS) to Chrome's
9-color tab-group palette. 6 exact matches; teal→cyan, indigo→blue,
slate→grey for the inexact pairs. Defensive grey fallback for unknown
input — should never trigger in production.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Extend chrome-mock for tabGroups + multi-tab move

**Files:**
- Modify: `tests/chrome-mock.js` (extend `tabs.move`, add `tabs.group`, `tabs.ungroup`, `chrome.tabGroups`)

The current mock at `tests/chrome-mock.js:225-227` rejects array-tabIds (`if (typeof tabIds !== 'number') return null`). We need:
1. `chrome.tabs.move(tabIdsArray, {index, windowId})` — re-orders multiple tabs at once.
2. `chrome.tabs.group({tabIds, groupId?, createProperties: {windowId}})` — groups tabs, returns groupId.
3. `chrome.tabs.ungroup(tabIds)` — removes tabs from any tab group.
4. `chrome.tabGroups.create / get / update / query` — tab-group lifecycle APIs.

- [ ] **Step 1: Write failing tests for the mock extensions**

Create `tests/sync-chrome-mock-extensions.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMocks, __setMockTabs } from './chrome-mock.js';

beforeEach(() => __resetMocks());

test('chrome.tabs.move accepts an array of tabIds', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
    { id: 3, windowId: 100, index: 2, url: 'c' },
  ]);
  await chrome.tabs.move([3, 1, 2], { index: 0, windowId: 100 });
  const tabs = await chrome.tabs.query({ windowId: 100 });
  const ordered = tabs.sort((a, b) => a.index - b.index).map((t) => t.id);
  assert.deepEqual(ordered, [3, 1, 2]);
});

test('chrome.tabs.group creates a new group when no groupId given', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
  ]);
  const groupId = await chrome.tabs.group({
    tabIds: [1, 2],
    createProperties: { windowId: 100 },
  });
  assert.equal(typeof groupId, 'number');
  assert.notEqual(groupId, -1);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, groupId);
});

test('chrome.tabs.group adds tabs to an existing group when groupId given', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
    { id: 3, windowId: 100, index: 2, url: 'c' },
  ]);
  const gid = await chrome.tabs.group({ tabIds: [1, 2], createProperties: { windowId: 100 } });
  await chrome.tabs.group({ tabIds: [3], groupId: gid });
  const tab3 = await chrome.tabs.get(3);
  assert.equal(tab3.groupId, gid);
});

test('chrome.tabGroups.update sets title and color', async () => {
  __setMockTabs([{ id: 1, windowId: 100, index: 0, url: 'a' }]);
  const gid = await chrome.tabs.group({ tabIds: [1], createProperties: { windowId: 100 } });
  await chrome.tabGroups.update(gid, { title: 'Work', color: 'blue' });
  const g = await chrome.tabGroups.get(gid);
  assert.equal(g.title, 'Work');
  assert.equal(g.color, 'blue');
});

test('chrome.tabGroups.get rejects on missing groupId', async () => {
  await assert.rejects(() => chrome.tabGroups.get(99999));
});

test('chrome.tabs.ungroup removes tabs from their groups', async () => {
  __setMockTabs([{ id: 1, windowId: 100, index: 0, url: 'a' }]);
  const gid = await chrome.tabs.group({ tabIds: [1], createProperties: { windowId: 100 } });
  await chrome.tabs.ungroup([1]);
  const t = await chrome.tabs.get(1);
  assert.equal(t.groupId, -1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-chrome-mock-extensions.test.js`
Expected: most fail — `chrome.tabs.group is not a function`, etc.

- [ ] **Step 3: Extend `chrome.tabs.move` for arrays**

In `tests/chrome-mock.js`, locate the `move` method (around line 225). Replace:
```js
  async move(tabIds, props) {
    tabs._moveCalls.push({ tabIds, props });
    if (typeof tabIds !== 'number') return null; // multi-move out of scope
```

with:
```js
  async move(tabIds, props) {
    tabs._moveCalls.push({ tabIds, props });
    if (Array.isArray(tabIds)) {
      /* B-041 (S42) — multi-move support. Chrome moves the tabs en bloc to
         the target index in the order specified by the array; subsequent
         tabs in the destination shift right. The mock approximates this by
         performing per-tab moves to consecutive indices starting from
         props.index, in the order of the input array. */
      const baseIndex = (props && typeof props.index === 'number') ? props.index : 0;
      const winId = (props && typeof props.windowId === 'number') ? props.windowId : null;
      const moved = [];
      for (let i = 0; i < tabIds.length; i++) {
        const tab = state.mockTabs.find((t) => t.id === tabIds[i]);
        if (!tab) throw new Error(`Tab ${tabIds[i]} not found`);
        const fromIndex = tab.index;
        const fromWindow = tab.windowId;
        const toIndex = baseIndex + i;
        const toWindow = winId ?? fromWindow;
        if (toWindow === fromWindow && toIndex !== fromIndex) {
          if (fromIndex < toIndex) {
            for (const t of state.mockTabs) {
              if (t.id === tab.id) continue;
              if (t.windowId !== fromWindow) continue;
              if (t.index > fromIndex && t.index <= toIndex) t.index -= 1;
            }
          } else {
            for (const t of state.mockTabs) {
              if (t.id === tab.id) continue;
              if (t.windowId !== fromWindow) continue;
              if (t.index >= toIndex && t.index < fromIndex) t.index += 1;
            }
          }
          tab.index = toIndex;
          tabs.onMoved.__fire(tab.id, { windowId: fromWindow, fromIndex, toIndex });
        } else {
          tab.index = toIndex;
          tab.windowId = toWindow;
        }
        moved.push(deepClone(tab));
      }
      return moved;
    }
    if (typeof tabIds !== 'number') return null;
```

(Keep the rest of the existing single-tab branch unchanged.)

- [ ] **Step 4: Add tabs.group, tabs.ungroup, and tabGroups APIs**

In `tests/chrome-mock.js`, find the closing `};` of the `tabs` object (around line 287). Inside `tabs`, add `group` and `ungroup` methods. After the `tabs` object, add a new `tabGroups` API and an internal group store.

After locating where `tabs.onMoved` is defined and the `tabs` object closes, add:

```js
// ============================================================================
// B-041 (S42) — chrome.tabGroups + chrome.tabs.group/ungroup mock surface.
// ============================================================================

let _nextGroupId = 1000;
const _mockGroups = new Map(); // groupId -> { id, windowId, title, color, collapsed }

const TAB_GROUP_ID_NONE = -1;

// Add `group` and `ungroup` to the tabs object.
tabs.group = async function tabsGroup({ tabIds, groupId, createProperties }) {
  const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
  let gid = groupId;
  if (typeof gid !== 'number') {
    gid = _nextGroupId++;
    const winId = createProperties && createProperties.windowId;
    if (typeof winId !== 'number') {
      throw new Error('chrome.tabs.group: createProperties.windowId required for new group');
    }
    _mockGroups.set(gid, {
      id: gid,
      windowId: winId,
      title: '',
      color: 'grey',
      collapsed: false,
    });
  } else if (!_mockGroups.has(gid)) {
    throw new Error(`chrome.tabs.group: groupId ${gid} not found`);
  }
  for (const id of ids) {
    const t = state.mockTabs.find((x) => x.id === id);
    if (!t) throw new Error(`chrome.tabs.group: tab ${id} not found`);
    t.groupId = gid;
  }
  return gid;
};

tabs.ungroup = async function tabsUngroup(tabIds) {
  const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
  for (const id of ids) {
    const t = state.mockTabs.find((x) => x.id === id);
    if (t) t.groupId = TAB_GROUP_ID_NONE;
  }
};

const tabGroups = {
  TAB_GROUP_ID_NONE,
  async get(groupId) {
    const g = _mockGroups.get(groupId);
    if (!g) throw new Error(`chrome.tabGroups.get: groupId ${groupId} not found`);
    return deepClone(g);
  },
  async update(groupId, props) {
    const g = _mockGroups.get(groupId);
    if (!g) throw new Error(`chrome.tabGroups.update: groupId ${groupId} not found`);
    Object.assign(g, props);
    return deepClone(g);
  },
  async query(filter = {}) {
    const out = [];
    for (const g of _mockGroups.values()) {
      if (typeof filter.windowId === 'number' && g.windowId !== filter.windowId) continue;
      out.push(deepClone(g));
    }
    return out;
  },
  async remove(groupId) {
    _mockGroups.delete(groupId);
  },
  onCreated: createEventMock(),
  onUpdated: createEventMock(),
  onRemoved: createEventMock(),
};
```

- [ ] **Step 5: Wire tabGroups onto the chrome global**

Locate the existing `globalThis.chrome = { tabs, ... };` assignment (search for `globalThis.chrome` in `tests/chrome-mock.js`). Add `tabGroups` to the object literal.

Also extend `__resetMocks` (search for the function) to clear `_mockGroups` and reset `_nextGroupId = 1000`. Reset `tabs._moveCalls = []`.

- [ ] **Step 6: Run the new mock tests**

Run: `node --test tests/sync-chrome-mock-extensions.test.js`
Expected: `tests 6 / pass 6 / fail 0`.

- [ ] **Step 7: Run full suite to confirm zero regressions**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1845 / pass 1845 / fail 0` (+6).

- [ ] **Step 8: Commit**

```bash
git add tests/chrome-mock.js tests/sync-chrome-mock-extensions.test.js
git commit -m "test: S42 — extend chrome-mock for tabGroups + multi-tab move

Adds chrome.tabGroups.{create,update,get,query,remove}, chrome.tabs.group,
chrome.tabs.ungroup, and array-tabIds support to chrome.tabs.move. Backs
the integration tests for the upcoming chrome-sync orchestrator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `_computeTargetStripOrder` pure helper (TDD)

**Files:**
- Create: `background/sync/chrome-sync.js` (with helper exports for testability)
- Create: `tests/sync-target-order.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/sync-target-order.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _computeTargetStripOrder } from '../background/sync/chrome-sync.js';

test('orders tabs: groups in TJ order, members in TJ order, then ungrouped', () => {
  const state = {
    windowId: 100,
    groups: [
      { id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11, 12, 13] },
      { id: 'g2', name: 'B', color: 'red', sortOrder: 1, tabIds: [21, 22] },
    ],
    ungroupedTabIds: [31, 32],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 12, 13, 21, 22, 31, 32]);
});

test('skips empty groups silently', () => {
  const state = {
    windowId: 100,
    groups: [
      { id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11] },
      { id: 'g2', name: 'B', color: 'red', sortOrder: 1, tabIds: [] },
      { id: 'g3', name: 'C', color: 'pink', sortOrder: 2, tabIds: [13] },
    ],
    ungroupedTabIds: [],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 13]);
});

test('excludes pinned tabs from output', () => {
  const state = {
    windowId: 100,
    groups: [{ id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11, 12] }],
    ungroupedTabIds: [21, 22],
    pinnedTabIds: new Set([12, 22]),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 21]);
});

test('excludes the Settings tab from output', () => {
  const state = {
    windowId: 100,
    groups: [{ id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11] }],
    ungroupedTabIds: [21, 99],
    pinnedTabIds: new Set(),
    settingsTabId: 99,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 21]);
});

test('returns empty array when nothing is groupable', () => {
  const state = {
    windowId: 100,
    groups: [],
    ungroupedTabIds: [],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-target-order.test.js`
Expected: import error — `_computeTargetStripOrder` not exported.

- [ ] **Step 3: Create the orchestrator file with the helper**

Create `background/sync/chrome-sync.js`:
```js
/**
 * background/sync/chrome-sync.js — TJ → Chrome tab-group snapshot sync.
 *
 * Spec: docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md
 * Scope: push-only, snapshot-only, current-window-only.
 *
 * Public entry: syncToChrome(windowId) — invoked by the SW handler on
 * MSG_SYNC_TO_CHROME. Returns a SyncSummary describing what was done.
 *
 * Helpers prefixed `_` are exported only for unit-test access. They are not
 * part of the SW message contract and may change without warning.
 */

import { tjColorToChromeColor } from './color-map.js';

/**
 * @typedef {Object} TJGroupForSync
 * @property {string} id
 * @property {string} name
 * @property {string} color    — TJ color slug from GROUP_COLORS
 * @property {number} sortOrder
 * @property {number[]} tabIds  — live tab IDs in this window, in TJ order
 * @property {number|null} [chromeTabGroupId]
 */

/**
 * @typedef {Object} SyncWindowState
 * @property {number} windowId
 * @property {TJGroupForSync[]} groups          — pre-sorted by sortOrder
 * @property {number[]} ungroupedTabIds         — pre-ordered Open Tab IDs
 * @property {Set<number>} pinnedTabIds
 * @property {number|null} settingsTabId        — exclude from reorder
 */

/**
 * @typedef {Object} SyncSummary
 * @property {number} windowId
 * @property {number} tabsReordered
 * @property {number} groupsCreated
 * @property {number} groupsUpdated
 * @property {Array<{reason: 'pinned'|'tab-gone'|'permission'|'unknown', count: number}>} skipped
 */

/**
 * Compute the desired tab-strip order: every TJ group's tabs in TJ order, then
 * ungrouped Open Tab IDs in TJ order. Skips empty groups, pinned tabs, and the
 * Settings tab itself.
 *
 * Pure function — no chrome.* calls, no mutation of inputs.
 *
 * @param {SyncWindowState} state
 * @returns {number[]} ordered tab IDs ready for chrome.tabs.move
 */
export function _computeTargetStripOrder(state) {
  const out = [];
  const isExcluded = (id) => state.pinnedTabIds.has(id) || id === state.settingsTabId;
  const sortedGroups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const g of sortedGroups) {
    for (const tabId of g.tabIds) {
      if (!isExcluded(tabId)) out.push(tabId);
    }
  }
  for (const tabId of state.ungroupedTabIds) {
    if (!isExcluded(tabId)) out.push(tabId);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sync-target-order.test.js`
Expected: `tests 5 / pass 5 / fail 0`.

- [ ] **Step 5: Run full suite and commit**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1850 / pass 1850 / fail 0` (+5).

```bash
git add background/sync/chrome-sync.js tests/sync-target-order.test.js
git commit -m "feat: S42 — _computeTargetStripOrder pure helper

First helper for the chrome-sync orchestrator. Computes the target tab-strip
order: groups in TJ sortOrder, members in TJ order, then ungrouped Open Tabs.
Skips empty groups silently; excludes pinned tabs and the Settings tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `_buildSummary` helper (TDD)

**Files:**
- Modify: `background/sync/chrome-sync.js` (append `_buildSummary`)
- Create: `tests/sync-build-summary.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/sync-build-summary.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _buildSummary } from '../background/sync/chrome-sync.js';

test('aggregates counts and returns an empty skipped array on full success', () => {
  const result = _buildSummary({
    windowId: 100,
    tabsReordered: 7,
    groupsCreated: 2,
    groupsUpdated: 1,
    skipReasons: [],
  });
  assert.deepEqual(result, {
    windowId: 100,
    tabsReordered: 7,
    groupsCreated: 2,
    groupsUpdated: 1,
    skipped: [],
  });
});

test('groups skip reasons by reason and counts occurrences', () => {
  const result = _buildSummary({
    windowId: 1,
    tabsReordered: 5,
    groupsCreated: 1,
    groupsUpdated: 0,
    skipReasons: ['pinned', 'pinned', 'tab-gone', 'unknown', 'pinned'],
  });
  const byReason = Object.fromEntries(result.skipped.map((s) => [s.reason, s.count]));
  assert.equal(byReason.pinned, 3);
  assert.equal(byReason['tab-gone'], 1);
  assert.equal(byReason.unknown, 1);
  assert.equal(result.skipped.length, 3);
});

test('skipped is sorted by reason for stable display', () => {
  const result = _buildSummary({
    windowId: 1, tabsReordered: 0, groupsCreated: 0, groupsUpdated: 0,
    skipReasons: ['unknown', 'pinned', 'tab-gone'],
  });
  assert.deepEqual(result.skipped.map((s) => s.reason), ['pinned', 'tab-gone', 'unknown']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-build-summary.test.js`
Expected: `_buildSummary` not exported.

- [ ] **Step 3: Append `_buildSummary` to chrome-sync.js**

In `background/sync/chrome-sync.js`, after `_computeTargetStripOrder`, append:

```js
/**
 * Aggregate raw counters + the array of skip-reason strings into the
 * SyncSummary shape that crosses the SW→UI boundary.
 *
 * @param {{
 *   windowId: number,
 *   tabsReordered: number,
 *   groupsCreated: number,
 *   groupsUpdated: number,
 *   skipReasons: Array<'pinned'|'tab-gone'|'permission'|'unknown'>,
 * }} input
 * @returns {SyncSummary}
 */
export function _buildSummary(input) {
  const counts = new Map();
  for (const reason of input.skipReasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const skipped = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  return {
    windowId: input.windowId,
    tabsReordered: input.tabsReordered,
    groupsCreated: input.groupsCreated,
    groupsUpdated: input.groupsUpdated,
    skipped,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/sync-build-summary.test.js`
Expected: `tests 3 / pass 3 / fail 0`.

- [ ] **Step 5: Run full suite and commit**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1853 / pass 1853 / fail 0` (+3).

```bash
git add background/sync/chrome-sync.js tests/sync-build-summary.test.js
git commit -m "feat: S42 — _buildSummary helper for chrome-sync

Aggregates skip-reason strings into stable, sorted SyncSummary.skipped[]
suitable for the Settings-page result toast.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `syncToChrome` orchestrator (TDD with chrome-mock)

**Files:**
- Modify: `background/sync/chrome-sync.js` (add `syncToChrome` + state-collector + group-applier)
- Create: `tests/sync-chrome-sync.test.js`

- [ ] **Step 1: Write failing integration tests**

Create `tests/sync-chrome-sync.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMocks, __setMockTabs, __setMockWindows } from './chrome-mock.js';
import { createGroup, listGroups, updateGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';
import { syncToChrome } from '../background/sync/chrome-sync.js';

beforeEach(async () => {
  await __resetMocks();
});

test('happy path — 2 groups + 2 ungrouped tabs are reordered and grouped', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/', title: 'A1' },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/', title: 'B1' },
    { id: 21, windowId: 100, index: 2, url: 'https://c.example/', title: 'A2' },
    { id: 31, windowId: 100, index: 3, url: 'https://d.example/', title: 'X' },
    { id: 32, windowId: 100, index: 4, url: 'https://e.example/', title: 'Y' },
  ]);
  const gWork = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: gWork.id, sortOrder: 0 });
  await createItem({ title: 'A2', url: 'https://c.example/', groupId: gWork.id, sortOrder: 1 });
  const gPersonal = await createGroup({ name: 'Personal', color: 'pink', parentId: null, sortOrder: 1 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: gPersonal.id, sortOrder: 0 });

  const summary = await syncToChrome(100);
  assert.equal(summary.windowId, 100);
  assert.equal(summary.groupsCreated, 2);
  assert.equal(summary.groupsUpdated, 0);
  assert.equal(summary.skipped.length, 0);

  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 2);
  const work = groups.find((g) => g.title === 'Work');
  const personal = groups.find((g) => g.title === 'Personal');
  assert.equal(work.color, 'blue');
  assert.equal(personal.color, 'pink');

  const tabs = (await chrome.tabs.query({ windowId: 100 })).sort((a, b) => a.index - b.index);
  assert.deepEqual(tabs.map((t) => t.id), [11, 21, 12, 31, 32]);
});

test('re-sync updates existing groups in place — no duplicate Chrome groups', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const groupsAfterFirst = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groupsAfterFirst.length, 1);
  const firstGid = groupsAfterFirst[0].id;

  // Rename the TJ group, re-sync.
  await updateGroup(g.id, { name: 'Work-renamed' });
  const summary = await syncToChrome(100);

  const groupsAfterSecond = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groupsAfterSecond.length, 1, 'no duplicate Chrome groups created');
  assert.equal(groupsAfterSecond[0].id, firstGid, 'same Chrome group ID reused');
  assert.equal(groupsAfterSecond[0].title, 'Work-renamed');
  assert.equal(summary.groupsCreated, 0);
  assert.equal(summary.groupsUpdated, 1);
});

test('stale chromeTabGroupId — Chrome group manually deleted between syncs — fresh create', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const [first] = await chrome.tabGroups.query({ windowId: 100 });
  // User manually deletes the Chrome group between syncs.
  await chrome.tabGroups.remove(first.id);

  const summary = await syncToChrome(100);
  assert.equal(summary.groupsCreated, 1);
  assert.equal(summary.groupsUpdated, 0);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  assert.notEqual(groups[0].id, first.id, 'fresh group id, not the stale one');
});

test('pinned tab is skipped and counted', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/', pinned: false },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/', pinned: true },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });

  const summary = await syncToChrome(100);
  const pinnedSkip = summary.skipped.find((s) => s.reason === 'pinned');
  assert.equal(pinnedSkip?.count, 1);
});

test('empty TJ group is skipped silently — no Chrome group created', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g1 = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g1.id, sortOrder: 0 });
  const g2 = await createGroup({ name: 'EmptyGroup', color: 'red', parentId: null, sortOrder: 1 });

  const summary = await syncToChrome(100);
  assert.equal(summary.groupsCreated, 1);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  // empty group not represented in skipped[] — silent
  assert(!summary.skipped.some((s) => s.reason === 'unknown'));
});

test('multi-window safety — only the target window is affected', async () => {
  __setMockWindows([{ id: 100, focused: true }, { id: 200, focused: false }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
    { id: 12, windowId: 200, index: 0, url: 'https://b.example/' },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });

  await syncToChrome(100);

  const groupsW100 = await chrome.tabGroups.query({ windowId: 100 });
  const groupsW200 = await chrome.tabGroups.query({ windowId: 200 });
  assert.equal(groupsW100.length, 1);
  assert.equal(groupsW200.length, 0);
});

test('chromeTabGroupId is persisted to TJ group record after first sync', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const groups = await listGroups();
  const stored = groups.find((x) => x.id === g.id);
  assert.equal(typeof stored.chromeTabGroupId, 'number');
  assert(stored.chromeTabGroupId > 0);
});

test('color mapping — TJ teal becomes Chrome cyan', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'teal', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const [grp] = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(grp.color, 'cyan');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-chrome-sync.test.js`
Expected: `syncToChrome` not exported.

- [ ] **Step 3: Implement state collection helper**

In `background/sync/chrome-sync.js`, after the existing helpers, append:

```js
/* ============================================================================
   State collection — turns chrome.* + storage reads into a SyncWindowState.
   ========================================================================== */

import { listGroups, updateGroup } from '../storage/groups.js';
import { listItems } from '../storage/items.js';

/**
 * Collect the live + stored state for the target window into a SyncWindowState.
 * Tabs are filtered to the target window. Pinned tabs are recorded separately
 * so the strip-reorder skips them but the orchestrator counts them as skipped.
 *
 * @param {number} windowId
 * @returns {Promise<SyncWindowState>}
 */
async function _collectWindowState(windowId) {
  const [allTabs, currentSelf] = await Promise.all([
    chrome.tabs.query({ windowId }),
    /* The Settings tab calling syncToChrome lives in this window — capture
       its id so the strip-reorder excludes it. */
    chrome.tabs.query({ active: true, windowId }).then((arr) => arr[0]),
  ]);
  const settingsTabId = currentSelf?.id ?? null;
  const pinnedTabIds = new Set(allTabs.filter((t) => t.pinned).map((t) => t.id));
  const tabsByUrl = new Map(allTabs.map((t) => [t.url, t]));

  const [groups, items] = await Promise.all([listGroups(), listItems()]);

  /* Compute per-group live tab IDs by URL match — TJ items carry `url`; we
     pair each item to its tab in this window, in TJ sortOrder. */
  const groupedTabIds = new Set();
  const tjGroups = groups
    .filter((g) => g.parentId === null) // top-level only; sub-groups not yet covered (out of scope)
    .map((g) => {
      const groupItems = items
        .filter((i) => i.groupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const tabIds = [];
      for (const it of groupItems) {
        const tab = tabsByUrl.get(it.url);
        if (tab && !groupedTabIds.has(tab.id)) {
          tabIds.push(tab.id);
          groupedTabIds.add(tab.id);
        }
      }
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        sortOrder: g.sortOrder,
        tabIds,
        chromeTabGroupId: g.chromeTabGroupId ?? null,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const ungroupedTabIds = allTabs
    .filter((t) => !groupedTabIds.has(t.id) && !t.pinned && t.id !== settingsTabId)
    .sort((a, b) => a.index - b.index)
    .map((t) => t.id);

  return { windowId, groups: tjGroups, ungroupedTabIds, pinnedTabIds, settingsTabId };
}
```

- [ ] **Step 4: Implement chrome-group resolver + applier**

Continue appending to `background/sync/chrome-sync.js`:

```js
/**
 * Verify a stored chromeTabGroupId is still live in Chrome. Returns the id if
 * valid, null if the group was deleted by the user or never existed.
 *
 * @param {number|null} storedId
 * @returns {Promise<number|null>}
 */
async function _validateChromeGroupId(storedId) {
  if (typeof storedId !== 'number') return null;
  try {
    await chrome.tabGroups.get(storedId);
    return storedId;
  } catch {
    return null;
  }
}

/**
 * Group `tabIds` into Chrome tab group `existingId` (or create new if null).
 * Then update title + color. Returns { groupId, created }.
 *
 * @param {{ tabIds: number[], existingId: number|null, title: string, color: string, windowId: number }} args
 */
async function _applyTabsToGroup({ tabIds, existingId, title, color, windowId }) {
  let groupId;
  let created = false;
  if (existingId !== null) {
    groupId = await chrome.tabs.group({ tabIds, groupId: existingId });
  } else {
    groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
    created = true;
  }
  await chrome.tabGroups.update(groupId, { title, color });
  return { groupId, created };
}
```

- [ ] **Step 5: Implement the public `syncToChrome` entry**

Continue appending:

```js
/* ============================================================================
   Public entry — syncToChrome(windowId).
   ========================================================================== */

/**
 * @param {number} windowId
 * @returns {Promise<SyncSummary>}
 */
export async function syncToChrome(windowId) {
  if (typeof windowId !== 'number') {
    throw new TypeError('syncToChrome: windowId must be a number');
  }
  const skipReasons = [];
  let tabsReordered = 0;
  let groupsCreated = 0;
  let groupsUpdated = 0;

  const state = await _collectWindowState(windowId);
  const targetOrder = _computeTargetStripOrder(state);

  // Count pinned tabs as skipped per spec §6.
  for (let i = 0; i < state.pinnedTabIds.size; i++) skipReasons.push('pinned');

  // Phase 1 — strip reorder (best-effort).
  if (targetOrder.length > 0) {
    try {
      await chrome.tabs.move(targetOrder, { index: 0, windowId });
      tabsReordered = targetOrder.length;
    } catch (err) {
      // If the bulk move fails, fall back to per-tab and count failures.
      for (let i = 0; i < targetOrder.length; i++) {
        try {
          await chrome.tabs.move(targetOrder[i], { index: i, windowId });
          tabsReordered++;
        } catch (perTabErr) {
          skipReasons.push(_classifyError(perTabErr));
        }
      }
    }
  }

  // Phase 2 — apply each non-empty TJ group.
  for (const g of state.groups) {
    const liveTabIds = g.tabIds.filter(
      (id) => !state.pinnedTabIds.has(id) && id !== state.settingsTabId,
    );
    if (liveTabIds.length === 0) continue; // empty groups skipped silently
    const validId = await _validateChromeGroupId(g.chromeTabGroupId);
    try {
      const { groupId, created } = await _applyTabsToGroup({
        tabIds: liveTabIds,
        existingId: validId,
        title: g.name,
        color: tjColorToChromeColor(g.color),
        windowId,
      });
      if (created) groupsCreated++; else groupsUpdated++;
      if (groupId !== g.chromeTabGroupId) {
        // Persist the new (or replacement) Chrome group ID back to the TJ record.
        await updateGroup(g.id, { chromeTabGroupId: groupId });
      }
    } catch (err) {
      skipReasons.push(_classifyError(err));
    }
  }

  return _buildSummary({
    windowId, tabsReordered, groupsCreated, groupsUpdated, skipReasons,
  });
}

/**
 * Map a thrown error to one of the SyncSummary skip-reason buckets.
 */
function _classifyError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  if (msg.includes('not found')) return 'tab-gone';
  if (msg.toLowerCase().includes('permission')) return 'permission';
  return 'unknown';
}
```

- [ ] **Step 6: Update the shapes/groups validator allow-list**

`updateGroup` allow-list at `background/storage/groups.js:116` is currently:
```js
const allowed = ['name', 'color', 'parentId', 'sortOrder', 'collapsed'];
```

Extend it to include `chromeTabGroupId`:
```js
const allowed = ['name', 'color', 'parentId', 'sortOrder', 'collapsed', 'chromeTabGroupId'];
```

Also extend `validateGroupPatch` at the same file to validate the new field:
```js
  if ('chromeTabGroupId' in patch
    && patch.chromeTabGroupId !== null
    && (typeof patch.chromeTabGroupId !== 'number' || !Number.isFinite(patch.chromeTabGroupId))) {
    throw new StorageError(ERR_VALIDATION, 'updateGroup: chromeTabGroupId must be number or null');
  }
```

(Insert after the `sortOrder` validation around line 133.)

- [ ] **Step 7: Run the integration tests**

Run: `node --test tests/sync-chrome-sync.test.js`
Expected: `tests 8 / pass 8 / fail 0`.

- [ ] **Step 8: Run full suite**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1861 / pass 1861 / fail 0` (+8).

- [ ] **Step 9: Commit**

```bash
git add background/sync/chrome-sync.js background/storage/groups.js tests/sync-chrome-sync.test.js
git commit -m "feat: S42 — syncToChrome orchestrator + chromeTabGroupId persistence

Public entry: syncToChrome(windowId). Reads TJ state, computes target strip
order, calls chrome.tabs.move (with per-tab fallback on bulk-move failure),
creates/updates Chrome tab groups, persists chromeTabGroupId back to TJ
group records. Stale mappings detected via chrome.tabGroups.get and
transparently replaced.

Extends updateGroup allow-list + validator to accept the new optional
chromeTabGroupId field per v5 schema.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: SW handler dispatch for MSG_SYNC_TO_CHROME

**Files:**
- Modify: `background/messages/storage-handlers.js` (import + dispatch case + WRITE_MESSAGE_TYPES)

- [ ] **Step 1: Write failing handler test**

Create `tests/sync-handler.test.js`. Follows the established test pattern from `tests/b044-import-dispatch.test.js`: register the listener, capture it from `chrome.runtime.onMessage._listeners`, invoke directly.

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMocks, __setMockTabs, __setMockWindows } from './chrome-mock.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';
import { createGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';

beforeEach(async () => {
  await __resetMocks();
});

function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}

async function dispatchMessage(payload) {
  return await new Promise((resolve) => {
    getListener()(
      { type: MSG_SYNC_TO_CHROME, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

test('MSG_SYNC_TO_CHROME dispatches to syncToChrome and returns ok envelope', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage({ windowId: 100 });
  assert.equal(resp.ok, true);
  assert.equal(resp.data.summary.windowId, 100);
  assert.equal(resp.data.summary.groupsCreated, 1);
});

test('MSG_SYNC_TO_CHROME with non-numeric windowId returns error envelope', async () => {
  registerStorageHandlers(Promise.resolve());
  const resp = await dispatchMessage({ windowId: 'abc' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'ERR_VALIDATION');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-handler.test.js`
Expected: dispatch case for `MSG_SYNC_TO_CHROME` not found.

- [ ] **Step 3: Add the import**

In `background/messages/storage-handlers.js`, find the message-import block (around line 10-50). Add:
```js
import { MSG_SYNC_TO_CHROME } from '../../shared/messages.js';
import { syncToChrome } from '../sync/chrome-sync.js';
```

- [ ] **Step 4: Add MSG_SYNC_TO_CHROME to WRITE_MESSAGE_TYPES**

Find `WRITE_MESSAGE_TYPES` (search the file). Add `MSG_SYNC_TO_CHROME` to the set so safe-mode rejects sync attempts:
```js
const WRITE_MESSAGE_TYPES = new Set([
  // ... existing entries ...
  MSG_SYNC_TO_CHROME,
]);
```

- [ ] **Step 5: Add the dispatch case**

In the `dispatch()` switch (around line 200), add a new `case` near the end (before `default:`):
```js
    case MSG_SYNC_TO_CHROME: {
      if (typeof p.windowId !== 'number') {
        throw new StorageError(ERR_VALIDATION, 'MSG_SYNC_TO_CHROME: windowId must be a number');
      }
      const summary = await syncToChrome(p.windowId);
      return { summary };
    }
```

- [ ] **Step 6: Run tests**

Run: `node --test tests/sync-handler.test.js`
Expected: `tests 2 / pass 2 / fail 0`.

- [ ] **Step 7: Run full suite**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1863 / pass 1863 / fail 0` (+2).

- [ ] **Step 8: Commit**

```bash
git add background/messages/storage-handlers.js tests/sync-handler.test.js
git commit -m "feat: S42 — MSG_SYNC_TO_CHROME dispatch + write-class registration

Wires syncToChrome behind the SW message handler. Validates payload.windowId
is a number; passes through to the orchestrator. Registered as a write-class
message so safe-mode (schemaVersion > KNOWN_VERSION) rejects sync attempts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Settings page — Chrome Integration fieldset HTML

**Files:**
- Modify: `settings/settings.html` (insert new fieldset between Theme and Data)

- [ ] **Step 1: Insert the new fieldset**

In `settings/settings.html`, find the existing `<fieldset class="settings-section" data-section="Theme">` block (line 63-68). After its closing `</fieldset>` (line 68) and BEFORE the Data fieldset (line 70), insert:

```html
        <fieldset class="settings-section" data-section="Chrome Integration">
          <legend class="settings-section-legend">Chrome Integration</legend>
          <p class="settings-section-help">
            Snapshot-push your current TJ window into Chrome's tab strip and
            tab groups. The browser tab strip will be reordered to match the
            order shown in your sidepanel; each TJ group becomes a Chrome tab
            group with the matching name and color.
          </p>
          <div class="settings-data-buttons">
            <button id="settings-sync-chrome-btn" type="button"
                    aria-label="Sync this window's tabs to Chrome tab groups">
              Sync this window to Chrome
            </button>
          </div>
        </fieldset>
```

The fieldset reuses the existing `settings-section` and `settings-data-buttons` classes from the Data section so we inherit the established layout without new CSS.

- [ ] **Step 2: Verify HTML loads cleanly**

Open the extension in Edge → click the gear icon → confirm the Settings page renders the new "Chrome Integration" section with a button. (Manual smoke — the test suite cannot exercise HTML parsing in node:test.)

If the help-text styling looks off, add a minimal rule to `settings/settings.css`:
```css
.settings-section-help {
  font-size: 0.85em;
  color: var(--text-secondary, #666);
  margin: 0 0 8px 0;
}
```
(Only add if visually needed; otherwise skip.)

- [ ] **Step 3: Commit**

```bash
git add settings/settings.html
git commit -m "feat: S42 — Settings page Chrome Integration fieldset (HTML)

Adds a new fieldset between Theme and Data with a single button:
'Sync this window to Chrome'. JS wiring follows in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Settings page — wire button + result toast (JS)

**Files:**
- Modify: `settings/settings.js` (add init function + click handler)

- [ ] **Step 1: Implement the wiring**

In `settings/settings.js`, after the existing `initImportExport` block (around line 156), add:

```js
  /* B-041 (S42) — Chrome Integration: Sync button.
     Single-click, snapshot push to chrome.tabs + chrome.tabGroups.
     Result is rendered via the existing #settings-toast surface. */
  try {
    initChromeSync({ doc: document, sendMessage });
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'NO_CODE';
    console.warn('[B-041] settings chrome-sync wiring failed', code);
  }
```

At the top of the file, add the import (alongside the existing imports at line 17-28):
```js
import { init as initChromeSync } from './settings-chrome-sync.js';
```

Then create a new file `settings/settings-chrome-sync.js`:

```js
/**
 * settings/settings-chrome-sync.js — Sprint 42 / B-041.
 *
 * Wires the "Sync this window to Chrome" button in the Settings page's
 * Chrome Integration fieldset. Captures chrome.windows.getCurrent().id at
 * click time, sends MSG_SYNC_TO_CHROME, renders the SyncSummary into the
 * existing #settings-toast surface. No new toast component — reuses the
 * B-093 / B-049 contract (one toast at a time, 4s auto-dismiss).
 */

import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';

let _doc = null;
let _sendMessage = null;
let _btnEl = null;
let _toastEl = null;
let _toastMessageEl = null;
let _toastTimer = null;

const TOAST_AUTO_DISMISS_MS = 4000;

export function init({ doc, sendMessage }) {
  if (!doc || typeof sendMessage !== 'function') {
    throw new Error('settings-chrome-sync init: doc + sendMessage required');
  }
  _doc = doc;
  _sendMessage = sendMessage;
  _btnEl = doc.getElementById('settings-sync-chrome-btn');
  _toastEl = doc.getElementById('settings-toast');
  _toastMessageEl = doc.getElementById('settings-toast-message');
  if (!_btnEl) return; // fieldset not present — graceful no-op
  _btnEl.addEventListener('click', _onSyncClick);
}

async function _onSyncClick() {
  _btnEl.disabled = true;
  try {
    const win = await chrome.windows.getCurrent();
    const summary = (await _sendMessage(MSG_SYNC_TO_CHROME, { windowId: win.id })).summary;
    _showToast(_formatSummaryMessage(summary), summary.skipped.length > 0 ? 'partial' : 'ok');
  } catch (err) {
    const reason = (err && err.message) ? err.message : 'unknown error';
    _showToast(`Sync failed · ${reason}`, 'error');
  } finally {
    _btnEl.disabled = false;
  }
}

function _formatSummaryMessage(summary) {
  const groupCount = summary.groupsCreated + summary.groupsUpdated;
  const base = `Synced · ${summary.tabsReordered} tabs · ${groupCount} groups`;
  if (summary.skipped.length === 0) return base;
  const total = summary.skipped.reduce((acc, s) => acc + s.count, 0);
  return `${base} · ${total} skipped`;
}

function _showToast(message, variant) {
  if (!_toastEl || !_toastMessageEl) return;
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
  _toastMessageEl.textContent = message;
  _toastEl.dataset.variant = variant; // 'ok' | 'partial' | 'error'
  _toastEl.hidden = false;
  _toastTimer = setTimeout(() => {
    _toastEl.hidden = true;
    _toastEl.dataset.variant = '';
    _toastTimer = null;
  }, TOAST_AUTO_DISMISS_MS);
}
```

- [ ] **Step 2: Add minimal styling for toast variants** (optional, if the existing `.toast` CSS doesn't already vary by data-variant)

Quickly check `settings/settings.css` for any `.toast[data-variant]` rules — if none, append:
```css
.toast[data-variant="partial"] { background-color: var(--toast-warning-bg, #fff3cd); }
.toast[data-variant="error"]   { background-color: var(--toast-error-bg, #f8d7da); }
.toast[data-variant="ok"]      { background-color: var(--toast-success-bg, #d4edda); }
```

- [ ] **Step 3: Smoke test**

This wiring lives in browser context (no node:test coverage). Smoke test manually after Task 12:
1. Reload extension in Edge.
2. Click gear icon → Settings page opens.
3. Click "Sync this window to Chrome".
4. Toast appears: "Synced · N tabs · M groups".
5. Inspect Chrome tab strip — groups appear with TJ titles + mapped colors.

- [ ] **Step 4: Commit**

```bash
git add settings/settings.js settings/settings-chrome-sync.js settings/settings.css
git commit -m "feat: S42 — Settings page chrome-sync button wiring + result toast

New module settings/settings-chrome-sync.js wires the button. Captures
chrome.windows.getCurrent().id at click time, fires MSG_SYNC_TO_CHROME,
renders summary into #settings-toast with three visual variants
(ok/partial/error). Reuses existing toast DOM (B-093 / B-049 contract);
no new component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Suppress chrome.tabs.onMoved storms during sync

**Files:**
- Modify: `background/sync/chrome-sync.js` (add `_isSyncing` flag, expose `isSyncInFlight()`)
- Modify: `background/tabs/tab-events.js` (gate the onMoved listener on `!isSyncInFlight()`)

R2 risk #6 from the spec. Each tab move during sync fires `chrome.tabs.onMoved`, which triggers `pruneFloatingGroupsByLiveTabId` and other listeners that re-bind floating-group state. During a sync, that's wasted work and risks reordering races. Best fix: a module-level "syncing" flag that other listeners check.

- [ ] **Step 1: Write failing test**

Append to `tests/sync-chrome-sync.test.js`:

```js
test('isSyncInFlight is true during sync, false before/after', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  const { isSyncInFlight } = await import('../background/sync/chrome-sync.js');
  assert.equal(isSyncInFlight(), false);
  const p = syncToChrome(100);
  // Right after invoking, before await resolves — still synchronous; flag is true.
  assert.equal(isSyncInFlight(), true);
  await p;
  assert.equal(isSyncInFlight(), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sync-chrome-sync.test.js`
Expected: `isSyncInFlight is not a function` for that case.

- [ ] **Step 3: Add the flag + getter**

In `background/sync/chrome-sync.js`, near the top of the module (after the imports), add:

```js
let _isSyncing = false;

/**
 * True iff a syncToChrome call is currently in flight. Other tab event
 * listeners (e.g., chrome.tabs.onMoved → floating-group re-bind) should
 * short-circuit while this is true to avoid storm-amplification during
 * the bulk reorder.
 *
 * @returns {boolean}
 */
export function isSyncInFlight() {
  return _isSyncing;
}
```

In `syncToChrome`, wrap the whole body in `try { _isSyncing = true; ... } finally { _isSyncing = false; }`:

```js
export async function syncToChrome(windowId) {
  if (typeof windowId !== 'number') {
    throw new TypeError('syncToChrome: windowId must be a number');
  }
  _isSyncing = true;
  try {
    // ... existing body unchanged ...
    return _buildSummary({
      windowId, tabsReordered, groupsCreated, groupsUpdated, skipReasons,
    });
  } finally {
    _isSyncing = false;
  }
}
```

- [ ] **Step 4: Gate the onMoved listener**

In `background/tabs/tab-events.js`, find the `chrome.tabs.onMoved.addListener(...)` registration. At the top of the listener body, add the early return:

```js
chrome.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  /* B-041 (S42) — suppress floating-group re-bind during chrome-sync.
     The bulk strip-reorder fires onMoved per-tab; processing each event
     wastes cycles and risks racing with our own writes. */
  if (isSyncInFlight()) return;
  // ... existing body ...
});
```

Add the import at the top of the file:
```js
import { isSyncInFlight } from '../sync/chrome-sync.js';
```

- [ ] **Step 5: Run the targeted test**

Run: `node --test tests/sync-chrome-sync.test.js`
Expected: `tests 9 / pass 9 / fail 0`.

- [ ] **Step 6: Run full suite to confirm no regressions in tab-events tests**

Run: `npm test 2>&1 | tail -3`
Expected: `tests 1864 / pass 1864 / fail 0` (+1).

- [ ] **Step 7: Commit**

```bash
git add background/sync/chrome-sync.js background/tabs/tab-events.js tests/sync-chrome-sync.test.js
git commit -m "fix: S42 — suppress floating-group re-bind during chrome-sync

Adds isSyncInFlight() flag + early return in chrome.tabs.onMoved listener
so the bulk strip-reorder doesn't trigger a storm of pruneFloatingGroups
calls. Resolves R2 risk #6 from the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: BACKLOG + SPRINT documentation updates

**Files:**
- Modify: `docs/BACKLOG.md` (B-041 status `backlog` → `done`, sprint column → 42)
- Modify: `docs/BACKLOG_BOARD.md` (B-041 ⬜ → ✅, progress dashboard)
- Modify: `docs/SPRINT.md` (active items → completed)
- Modify: `docs/SOLUTION_DESIGN.md` (TOC entry for the new chapter)
- Create: `docs/design/67-b-041-chrome-tab-group-sync.md` (R6 close chapter)

These are tracked under the standard sprint pipeline (R6 close + Gates 4/5). Defer the bulk of the chapter writing to the [solution-architect] R6 round; for the plan we just stub the chapter file so the directory layout is in place.

- [ ] **Step 1: Update BACKLOG.md row for B-041**

Find the B-041 row. Change status from `backlog` to `done | 42`. Update the description if needed to reference the snapshot-only scope.

- [ ] **Step 2: Update BACKLOG_BOARD.md**

Flip the B-041 marker from ⬜ to ✅. Bump the v2.42 progress count by 1.

- [ ] **Step 3: Add new design chapter stub**

Create `docs/design/67-b-041-chrome-tab-group-sync.md`:
```markdown
# §67 — B-041 Chrome tab group sync (Sprint 42)

**Status**: as-built — Sprint 42 close
**Spec**: `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md`
**Anchor item**: B-041 (closes the P2/L pre-S33 placeholder).

> R6 close chapter — to be filled in by [solution-architect] after R5
> testing passes. Records as-built deviations from the spec, exact storage
> schema diff, message contract, manifest changes, rollback plan.
>
> Until R6 lands, this stub serves as the directory placeholder so the
> root TOC entry resolves.

## §67.1 As-built (placeholder)
TBD at R6.

## §67.2 Storage schema v4 → v5 (placeholder)
TBD at R6.

## §67.3 Rollback plan (placeholder)
TBD at R6.
```

(The `TBD at R6` markers are acceptable here because the chapter is explicitly an R6-deliverable scaffold; the [solution-architect] fills these in at sprint close. They are NOT plan-step placeholders.)

- [ ] **Step 4: Add TOC entry to SOLUTION_DESIGN.md**

In `docs/SOLUTION_DESIGN.md`, find the chapter index list. Append:
```markdown
- [§67 — B-041 Chrome tab group sync](design/67-b-041-chrome-tab-group-sync.md) — Sprint 42 snapshot push to Chrome tab strip + tab groups
```

- [ ] **Step 5: Commit**

```bash
git add docs/BACKLOG.md docs/BACKLOG_BOARD.md docs/SOLUTION_DESIGN.md docs/design/67-b-041-chrome-tab-group-sync.md
git commit -m "docs: S42 — flip B-041 to done + scaffold §67 chapter

BACKLOG status backlog→done, BACKLOG_BOARD flag flip, new §67 chapter stub
to hold R6 as-built notes, root index TOC entry. R6 [solution-architect]
fills in the chapter body after R5 testing passes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Manual UAT smoke test

**Files:**
- None modified (verification only)
- Create: `docs/UAT_B-041.md` (UAT script + results template)

- [ ] **Step 1: Write the UAT script**

Create `docs/UAT_B-041.md`:
```markdown
# UAT — B-041 Chrome tab group sync (Sprint 42)

**Browser**: Edge (per project memory — user runs Edge, not Chrome)
**Pre-conditions**: Extension loaded unpacked, schema migrated to v5,
no existing chromeTabGroupId on any TJ group.

## Test cases

| # | Scenario | Expected | Actual | Status |
|---|----------|----------|--------|--------|
| 1 | First-time sync (2 groups, 4 tabs in current window) | Strip reordered to TJ order; 2 Chrome tab groups created with matching titles + mapped colors; toast "Synced · 4 tabs · 2 groups" |  |  |
| 2 | Re-sync with no changes | No duplicate groups; toast shows groupsUpdated:2, groupsCreated:0 |  |  |
| 3 | Re-sync after TJ group rename | Chrome group renamed; mapping persists |  |  |
| 4 | Re-sync after TJ color change (teal → blue) | Chrome color updates from cyan to blue |  |  |
| 5 | Re-sync after manual Chrome group rename | TJ wins — Chrome name overwritten back to TJ name |  |  |
| 6 | Re-sync after manual Chrome group delete | Stale mapping cleared; fresh Chrome group created |  |  |
| 7 | Sync with one pinned tab in a TJ group | Pinned tab skipped; toast shows "1 skipped"; pinned tab stays at left of strip |  |  |
| 8 | Sync with two windows open, only one is the Settings window | Only the Settings window's tab strip is touched; the other window is untouched |  |  |
| 9 | Sync with one TJ group having zero live tabs in this window | Empty group not represented in Chrome; no error |  |  |
| 10 | Sync color check — TJ teal | Chrome cyan |  |  |
| 11 | Sync color check — TJ indigo | Chrome blue |  |  |
| 12 | Sync color check — TJ slate | Chrome grey |  |  |
| 13 | Reload extension → re-sync | chromeTabGroupId mappings survive cold start; re-sync hits Chrome get(), validates, updates in place |  |  |
| 14 | Sync with chromeTabGroupId in storage but Chrome restart cleared all groups | All stale mappings detected; fresh groups created |  |  |
| 15 | Settings page in Window A, sync, then move Settings tab to Window B, sync again | Each sync targets the window the Settings tab was in at click time |  |  |

## Performance
- Sync of 50 tabs across 5 groups should complete in < 1s (rough budget; chrome.tabs.move + chrome.tabGroups.update are cheap APIs).

## Sign-off
- [ ] All 15 cases PASS
- [ ] No console errors during any sync
- [ ] No regressions in existing UI (sidepanel, newtab, popup all behave as before)
```

- [ ] **Step 2: Run UAT manually in Edge**

1. Reload the unpacked extension.
2. Open Settings → confirm "Chrome Integration" fieldset is visible.
3. Walk through each numbered test case; record Actual + Status (PASS / FAIL / WARN / SKIP).
4. If any case FAILs, file a fix and route back through the pipeline before sprint close.

- [ ] **Step 3: Commit UAT script + results**

```bash
git add docs/UAT_B-041.md
git commit -m "docs: S42 — UAT script for B-041 chrome tab group sync

15 test cases covering happy path, re-sync, stale mapping, pinned tab,
multi-window safety, color mapping, cold-start persistence. Results
filled in during R5 UAT execution.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Final regression run + version bump + CHANGELOG

**Files:**
- Modify: `manifest.json` (version 1.35.0 → 1.36.0)
- Modify: `CHANGELOG.md` (new v1.36.0 entry)
- Modify: `docs/RELEASES.md` (mirror entry)

- [ ] **Step 1: Run the full test suite one more time**

Run: `npm test 2>&1 | tail -5`
Expected: `tests 1864 / pass 1864 / fail 0`. (Exact baseline depends on +1/+2 from intermediate tasks; the count should be ~ +38 over the 1826 baseline.)

If any test fails, do NOT proceed to the version bump. Investigate, fix, re-test.

- [ ] **Step 2: Bump manifest version**

Edit `manifest.json:5`:
```json
  "version": "1.36.0",
```

- [ ] **Step 3: Add CHANGELOG entry**

In `CHANGELOG.md`, prepend a new entry above the v1.35.0 block:

```markdown
## v1.36.0 — 2026-05-XX (Sprint 42)

### New features
- **Chrome tab group sync (snapshot push)** — Settings page → Chrome Integration → "Sync this window to Chrome". TJ groups become Chrome tab groups (with title + mapped color); tabs are reordered in the strip to match TJ order; ungrouped Open Tabs are reordered but stay ungrouped. Push-only, snapshot-only, current-window only this release. Auto-sync (continuous mirror) is planned for a future release. Closes B-041.

### Storage migrations
- `tj:groups` records gain optional `chromeTabGroupId: number | null`. Schema v4 → v5. Lazy data migration (legacy v4 records stamp the field on first sync). Governance bump per C-1a; `KNOWN_VERSION` and `defaultShape(PARTITION_META).schemaVersion` both move to 5.

**Action required after update**: toggle the extension OFF then ON in `chrome://extensions` (Edge: `edge://extensions`) to flush the SW module cache and pick up the new schema.

### Internal
- New module `background/sync/` with `chrome-sync.js` orchestrator + `color-map.js` palette mapping.
- New `MSG_SYNC_TO_CHROME` message contract.
- Test count: +38 tests (~1864 total / 100% PASS).
```

- [ ] **Step 4: Mirror entry to RELEASES.md**

Append the same content to `docs/RELEASES.md` as the new v1.36.0 entry.

- [ ] **Step 5: Final commit**

```bash
git add manifest.json CHANGELOG.md docs/RELEASES.md
git commit -m "chore: S42 close — bump to v1.36.0 + CHANGELOG

Snapshot push to Chrome tab groups (B-041) ships in v1.36.0. Schema v4→v5
governance bump. Action-required note: extension toggle OFF→ON after update.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Final Step 1**: `npm test` — all green.
- [ ] **Final Step 2**: `git log --oneline release/v2..HEAD` — confirm 14 commits land cleanly on the feature branch.
- [ ] **Final Step 3**: Manually walk UAT in Edge — all 15 cases PASS.
- [ ] **Final Step 4**: Open PR `feature/sprint-42-chrome-sync` → `release/v2` (per project branching rule). Tag and release per the established Sprint Close sequence (`gh release create` is SKIPPED per user preference).

---

## Self-Review Notes

**Spec coverage**:
- §1 Goal — Tasks 6, 8, 11 (orchestrator + UI)
- §2 Locked decisions — encoded in task structure
- §3.1 New modules — Tasks 4, 6
- §3.2 Manifest permission — already in place; verified Task 1
- §3.3 New storage field — Task 3
- §3.4 New message contract — Tasks 2, 9
- §3.5 Settings UI — Tasks 10, 11
- §4 Data flow — Task 8
- §5 Color table — Task 4
- §6 Error handling — Task 7 (`_buildSummary`) + Task 8 (`_classifyError`)
- §7 R2 risks — Task 12 (risk #6, suppress onMoved storm); risk #2 (settings tab self-displacement) handled in `_collectWindowState` via `settingsTabId`; risk #3 (empty tabIds) handled by the `liveTabIds.length === 0` guard in Task 8; risk #1 (`chrome.tabs.move` array atomicity) covered by Task 8's per-tab fallback; risk #4 (stale mapping) is `_validateChromeGroupId` in Task 8; risk #5 + #7 are documented behavior, no code change needed.
- §8 Testing — Tasks 4, 5, 6, 7, 8, 9, 12, 14
- §9 Tier — implicit in plan structure (Tier 2 Full M)

**Placeholder scan**: The only `TBD` markers are in the §67 chapter stub (Task 13), explicitly labeled as R6-deliverable. All implementation steps contain concrete code.

**Type consistency**:
- `SyncSummary` shape consistent across Tasks 7, 8, 9, 11.
- `_computeTargetStripOrder` signature: `(state: SyncWindowState) => number[]` — used in Task 6 + Task 8.
- `tjColorToChromeColor` signature: `(tjColor: string) => ChromeColor` — used in Task 4 + Task 8.
- `chromeTabGroupId` field type: `number | null` — used consistently in Tasks 3, 8.
