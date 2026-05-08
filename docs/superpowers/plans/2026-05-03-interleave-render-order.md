# B-148 Interleave floating + saved — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saved bookmarks + floating tabs within a Tab Junkie group can be interleaved into one user-defined sequence; the order is owned by the Group record, persists across tab close + extension restart, and applies to both sidepanel and newtab surfaces.

**Architecture:** Schema v6→v7 lazy migration adds optional `Group.renderOrder: string[]` (prefix-encoded `item:<id>` / `floating:<id>` per-group ordered list). New `shared/render-order.js` resolver consumes it. 12 storage write sites update renderOrder atomically inside multi-partition writeTransactions. Sidepanel + newtab render paths use the resolver. Cold-start `reassociateFloatingGroups` extends to bootstrap legacy v6 groups + strip stale refs.

**Tech Stack:** Vanilla JS ES modules · Chrome Extension MV3 · `chrome.storage.local` via `writeTransaction` · `node:test` runner · `tests/chrome-mock.js`.

**Spec:** `docs/superpowers/specs/2026-05-03-interleave-render-order-design.md` (commit `85a2441`).

**Baseline:** Branch off `release/v2`. Test count baseline: **1,930 / 1,930 PASS** (post-v1.38.1; B-161 PR #52 still open with v1.38.2 staged — plan assumes B-161 may merge during S44, recompute baseline at branch creation).

**Tier:** Tier 3 — Spike-First (XL).

---

## File Structure

### Created

| Path | Responsibility |
|------|----------------|
| `shared/render-order.js` | Pure resolver. `resolveRenderOrder(group, groupItems, groupFloatingMembers)` returns ordered render rows. Bootstrap fallback when `renderOrder` missing. |
| `tests/b148-render-order-resolver.test.js` | Unit tests for resolver (8-12 cases). |
| `tests/b148-schema-v7.test.js` | Schema bump pin + validator tests. |
| `tests/b148-renderorder-write-paths.test.js` | Integration tests across all 12 write sites. |
| `tests/b148-cold-start-bootstrap.test.js` | Cold-start bootstrap + stale-ref stripping. |
| `tests/b148-mixed-type-drag.test.js` | Sidepanel drag hit-test for mixed-type drops. |
| `docs/UAT_B-148.md` | UAT script (10-15 cases). |

### Modified

| Path | Change |
|------|--------|
| `background/storage/migration.js` | `KNOWN_VERSION` 6→7; new no-op v6→v7 entry. |
| `background/storage/shapes.js` | `defaultShape(PARTITION_META).schemaVersion = 7`; `isGroup` validator accepts optional `renderOrder` array of prefix-encoded strings. |
| `background/storage/groups.js` | `validateGroupPatch` allow-list + per-element validator. |
| `background/storage/items.js` | `createItem`, `deleteItem`, `updateItem({groupId})`, `bulkCreateItems`, `bulkDeleteItems`, `bulkReorderItems` participate in multi-partition writeTransactions touching `tj:items` + `tj:groups`. |
| `background/import/import-collection.js` | Replace mode clears all renderOrders; bootstrap re-derives. |
| `background/tabs/floating-groups.js` | `appendFloatingGroup`, `moveFloatingTab`, `pruneFloatingGroupsByLiveTabId`, `pruneFloatingGroupsByParentItemId` update renderOrder. |
| `background/tabs/tab-claims.js` | `reassociateFloatingGroups` extends to bootstrap + strip stale refs in same writeTransaction. |
| `background/messages/storage-handlers.js` | `MSG_REORDER_FLOATING_MEMBERS` + saved-item-reorder handlers update renderOrder. |
| `sidepanel/sidepanel.js` | Render path consumes resolver; `_buildTabDragRectCache` + `_computeTabDropTarget` extended for mixed-type insert positions. |
| `newtab/newtab.js` | Render path consumes resolver. |
| `manifest.json` | Version 1.38.x → 1.39.0 (schema bump warrants minor bump). |
| `CHANGELOG.md` + `docs/RELEASES.md` | v1.39.0 entry with SW flush note. |
| 5 schema-pin tests | `sync-schema-v5.test.js`, `migration-fresh-install.test.js`, `migration-steps.test.js`, plus any other version-literal pins; bumped 6→7. |

---

## Task 1: Branch creation + baseline confirmation

**Files:** None modified.

- [ ] **Step 1: Verify on release/v2 with clean tree**

```bash
git status --short && git rev-parse --abbrev-ref HEAD
```
Expected: empty status, `release/v2` branch.

- [ ] **Step 2: Confirm baseline test count**

```bash
npm test 2>&1 | grep -E "tests \d|pass \d|fail \d" | tail -3
```
Expected: `tests 1930 / pass 1930 / fail 0` (or higher if B-161 PR #52 has merged — recompute target deltas accordingly).

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b feature/sprint-44-interleave
```
Expected: `Switched to a new branch 'feature/sprint-44-interleave'`.

- [ ] **Step 4: Verify writeTransaction supports multi-partition + multi-mutator**

```bash
grep -n "ops.map\|partitions.map\|chrome.storage.local.set" background/storage/write-transaction.js | head -5
```
Expected output confirms a SINGLE `chrome.storage.local.set({...})` call is used to commit all partitions atomically — this is the foundation of B-148's multi-partition writeTransaction usage. If the storage layer has changed since the spec was written, STOP and escalate.

- [ ] **Step 5: No commit at this stage** — branch ready.

---

## Task 2: R0 Spike A — confirm multi-partition writeTransaction atomicity

**Files:** Create `tests/b148-r0-spike-multi-partition.test.js` (TEMP, removed at Task 7).

The spec assumes `writeTransaction([{partition: 'items', ...}, {partition: 'groups', ...}])` is atomic across BOTH partitions. R0 verifies before R3 builds on this assumption.

- [ ] **Step 1: Write the spike test**

Create `tests/b148-r0-spike-multi-partition.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import { writeTransaction } from '../background/storage/write-transaction.js';
import { PARTITION_ITEMS, PARTITION_GROUPS } from '../background/storage/partitions.js';

beforeEach(async () => {
  await __resetMock();
});

test('B-148 R0 spike A: writeTransaction commits multi-partition mutators atomically', async () => {
  await writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: () => ([{
        id: 'i1', title: 'X', url: 'https://x.example/',
        groupId: 'g1', sortOrder: 0, createdAt: 1, updatedAt: 1,
      }]),
    },
    {
      partition: PARTITION_GROUPS,
      mutator: () => ([{
        id: 'g1', name: 'G', color: 'blue', parentId: null,
        sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
        renderOrder: ['item:i1'],
      }]),
    },
  ]);
  const items = __getRawStore('tj:items');
  const groups = __getRawStore('tj:groups');
  assert.equal(items.length, 1);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].renderOrder, ['item:i1']);
});

test('B-148 R0 spike A: multi-partition rollback on mutator throw', async () => {
  await assert.rejects(() => writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: () => ([{
        id: 'i1', title: 'X', url: 'https://x.example/',
        groupId: 'g1', sortOrder: 0, createdAt: 1, updatedAt: 1,
      }]),
    },
    {
      partition: PARTITION_GROUPS,
      mutator: () => { throw new Error('boom'); },
    },
  ]));
  const items = __getRawStore('tj:items');
  assert.equal(items, undefined, 'items partition NOT committed when groups mutator threw');
});
```

- [ ] **Step 2: Run the spike test**

```bash
node --test tests/b148-r0-spike-multi-partition.test.js 2>&1 | tail -5
```
Expected: `tests 2 / pass 2 / fail 0`.

- [ ] **Step 3: If spike test fails**

If atomicity is NOT preserved (one partition wrote but the other didn't on rollback), STOP and escalate. The plan assumes atomic multi-partition; without it, the entire B-148 architecture is unsound. Possible mitigations: re-introduce a single-partition pattern that stores both items and renderOrder in `tj:groups` as duplicated data, OR add explicit retry/rollback logic. R0 owner picks; spec amendment required.

- [ ] **Step 4: If spike test passes**

Document outcome in plan-execution log: `R0 spike A: PASS — multi-partition writeTransaction confirmed atomic`. Proceed to Task 3.

- [ ] **Step 5: Do NOT commit yet**

Spike test file is temporary; will be removed at Task 7 step 6 along with R0 instrumentation.

---

## Task 3: R0 Spike B — measure cold-start bootstrap performance

**Files:** Create `tests/b148-r0-spike-bootstrap-perf.test.js` (TEMP).

Cold-start bootstrap reads all groups + items + floating-group records, derives renderOrder for each unboot­strapped group, writes back. Spec §6 risk #2: performance for large profiles (200+ items × 20+ groups). R0 measures.

- [ ] **Step 1: Write the perf-measurement spike**

Create `tests/b148-r0-spike-bootstrap-perf.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock } from './chrome-mock.js';
import { writeTransaction } from '../background/storage/write-transaction.js';
import { PARTITION_ITEMS, PARTITION_GROUPS, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';

beforeEach(async () => __resetMock());

test('B-148 R0 spike B: bootstrap-derive-write for 20 groups × 50 items × 50 floating', async () => {
  /* Seed via direct storage write — bypass createItem/etc to control shape. */
  const groups = [];
  const items = [];
  const floating = [];
  for (let g = 0; g < 20; g++) {
    groups.push({
      id: 'g' + g, name: 'G' + g, color: 'blue', parentId: null,
      sortOrder: g, collapsed: false, createdAt: 1, updatedAt: 1,
    });
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `i${g}_${i}`, title: 'X', url: `https://x.example/${g}/${i}`,
        groupId: 'g' + g, sortOrder: i, createdAt: 1, updatedAt: 1,
      });
    }
    for (let f = 0; f < 50; f++) {
      floating.push({
        floatingTabId: `f${g}_${f}`, groupId: 'g' + g,
        parentItemId: `i${g}_0`, windowId: 1, tabIndex: f,
        url: '', savedAt: 1, sortOrder: f, liveTabId: 1000 + g * 50 + f,
      });
    }
  }
  await writeTransaction([
    { partition: PARTITION_GROUPS, mutator: () => groups },
    { partition: PARTITION_ITEMS, mutator: () => items },
    { partition: PARTITION_FLOATING_GROUPS, mutator: () => floating },
  ]);

  /* Measure bootstrap derivation. Expected logic: for each group, derive
     renderOrder from items (Item.sortOrder asc) + floating (record.sortOrder
     asc), produce string[]. */
  const t0 = performance.now();
  const groupsAfter = groups.map((g) => {
    const groupItems = items.filter((it) => it.groupId === g.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const groupFloating = floating.filter((f) => f.groupId === g.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      ...g,
      renderOrder: [
        ...groupItems.map((i) => 'item:' + i.id),
        ...groupFloating.map((f) => 'floating:' + f.floatingTabId),
      ],
    };
  });
  await writeTransaction([
    { partition: PARTITION_GROUPS, mutator: () => groupsAfter },
  ]);
  const t1 = performance.now();
  const elapsedMs = t1 - t0;
  console.log(`[B-148 R0 spike B] bootstrap elapsed: ${elapsedMs.toFixed(2)}ms for 20×50×50 profile`);
  /* No hard assertion — observation only. R0 owner decides if elapsed > some
     threshold (e.g., 250ms) warrants the lazy-bootstrap fallback per spec
     risk #2. */
  assert.ok(elapsedMs >= 0);
});
```

- [ ] **Step 2: Run the spike test**

```bash
node --test tests/b148-r0-spike-bootstrap-perf.test.js 2>&1 | tail -10
```
Expected: a `[B-148 R0 spike B]` log line with the elapsed millis, plus PASS.

- [ ] **Step 3: Decide based on outcome**

- If elapsed < 250ms in the test environment → upfront bootstrap is fine; proceed with eager-cold-start design (default).
- If elapsed > 250ms → switch to LAZY per-group bootstrap on first render (each group's render-path checks if renderOrder is missing, derives + persists back). Spec amendment + plan amendment.

Document the decision in plan-execution log.

- [ ] **Step 4: Do NOT commit yet**

Spike file removed at Task 7.

---

## Task 4: R0 Spike C — pick drag wire format (full array vs delta)

**Files:** No code; decision-only.

Spec §3.8 defers the wire-format decision to R0/R1. Two options:

**Option A — full renderOrder array per drag:**
```
MSG_REORDER_FLOATING_MEMBERS payload:
{ groupId: string, renderOrder: string[] }
```
Pros: SW handler is trivial — write what the client computed. Cons: full array transmitted on every drag (20-100 entries × ~30 bytes ≈ 0.6-3 KB per message).

**Option B — delta `{ref, insertIndex}`:**
```
MSG_REORDER_FLOATING_MEMBERS payload:
{ groupId: string, ref: string, insertIndex: number }
```
Pros: minimal payload (~50 bytes). Cons: SW splices the existing renderOrder; race-guard required if client and server disagree on the pre-image.

- [ ] **Step 1: Pick A**

Recommended: **Option A**. Rationale:
- Wire size is fine (< 5 KB even at the high end; chrome.runtime.sendMessage handles MB-scale payloads).
- SW handler logic is trivial: validate array, write. No race-guard needed.
- Matches the "client computes the new order, sends it" mental model.
- Per Q3-A: same op vocabulary, payload evolves to carry full array.

- [ ] **Step 2: Document the decision**

Plan-execution log: `R0 spike C: chose Option A (full renderOrder array). Wire format for MSG_REORDER_FLOATING_MEMBERS payload: { groupId: string, renderOrder: string[] }`.

- [ ] **Step 3: No code change yet**

Reflected in tasks below.

---

## Task 5: Schema bump v6 → v7 + validator extension

**Files:**
- Modify: `background/storage/migration.js:89` (`KNOWN_VERSION`)
- Modify: `background/storage/migration.js:104-` (`MIGRATION_STEPS`)
- Modify: `background/storage/shapes.js:111` (`defaultShape(PARTITION_META).schemaVersion`)
- Modify: `background/storage/shapes.js:140-160` (`isGroup` validator + new `MAX_REF_LENGTH` const)
- Create: `tests/b148-schema-v7.test.js`

- [ ] **Step 1: Write failing schema tests**

Create `tests/b148-schema-v7.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';
import {
  defaultShape, PARTITION_META, assertShape, PARTITION_GROUPS,
} from '../background/storage/shapes.js';

test('B-148 §3.1: KNOWN_VERSION === 7', () => {
  assert.equal(KNOWN_VERSION, 7);
});

test('B-148 §3.1: defaultShape(PARTITION_META).schemaVersion === 7', () => {
  assert.equal(defaultShape(PARTITION_META).schemaVersion, 7);
});

function group(extra = {}) {
  return Object.assign({
    id: 'g1', name: 'G', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}

test('B-148 §3.2: isGroup accepts legacy v6 group without renderOrder', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group()]));
});

test('B-148 §3.2: isGroup accepts v7 group with empty renderOrder', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: [] })]));
});

test('B-148 §3.2: isGroup accepts v7 group with valid renderOrder entries', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group({
    renderOrder: ['item:01HZABC', 'floating:01HZDEF'],
  })]));
});

test('B-148 §3.2: isGroup rejects renderOrder that is not an array', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: 'item:1' })]));
});

test('B-148 §3.2: isGroup rejects renderOrder entry without prefix', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: ['just-a-id'] })]));
});

test('B-148 §3.2: isGroup rejects renderOrder entry with wrong prefix', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: ['url:https://x'] })]));
});

test('B-148 §3.2: isGroup rejects oversized renderOrder entry', () => {
  const oversized = 'item:' + 'X'.repeat(100);
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: [oversized] })]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/b148-schema-v7.test.js 2>&1 | tail -5
```
Expected: 9 fail (`KNOWN_VERSION === 6 not 7`, etc.).

- [ ] **Step 3: Bump KNOWN_VERSION**

Edit `background/storage/migration.js:89`:
```js
export const KNOWN_VERSION = 7;
```

- [ ] **Step 4: Append v6→v7 MIGRATION_STEPS entry**

In `background/storage/migration.js`, after the existing v5→v6 step (around the end of `MIGRATION_STEPS`):
```js
  /* B-148 §3.1 (S44) — v6 → v7 governance bump. No-op migrate: lazy data
     migration (option 2). `tj:groups` records gain an OPTIONAL
     `renderOrder: string[]` of prefix-encoded refs (`item:<id>` /
     `floating:<floatingTabId>`) used by sidepanel + newtab render-paths
     to display saved-bookmark + floating-tab rows in user-defined
     interleaved order. Legacy v6 groups lack the field; cold-start
     `reassociateFloatingGroups` (extended at Task 9) bootstraps the
     missing array from current Item.sortOrder + FloatingGroup.sortOrder
     on first cold-start post-upgrade. The governance bump is required
     by C-1a even when data migration is lazy (C-1b option 2). */
  {
    fromVersion: 6,
    toVersion: 7,
    migrate: (snapshot) => snapshot,
  },
```

- [ ] **Step 5: Bump defaultShape schemaVersion**

Edit `background/storage/shapes.js:111` (or current line for the v6 literal):
```js
return { schemaVersion: 7, createdAt: Date.now() };
```
Update the comment block above to add a v6→v7 history entry.

- [ ] **Step 6: Add MAX_REF_LENGTH constant**

Near the top of `background/storage/shapes.js` (after existing imports):
```js
/* B-148 §3.2 — Maximum length for a renderOrder ref entry. Prefix
   ('item:' / 'floating:') + ULID (26 chars) + comfort buffer = 64. */
const MAX_REF_LENGTH = 64;
```

- [ ] **Step 7: Extend isGroup validator**

Edit `background/storage/shapes.js` `isGroup` function. Add the renderOrder check before `return true`:
```js
  /* B-148 §3.2 — OPTIONAL renderOrder. Each entry must be a prefix-encoded
     ref. Empty array is valid. Anything else is corrupt. */
  if ('renderOrder' in v) {
    if (!Array.isArray(v.renderOrder)) return false;
    for (const entry of v.renderOrder) {
      if (typeof entry !== 'string' || entry.length === 0) return false;
      if (!entry.startsWith('item:') && !entry.startsWith('floating:')) return false;
      if (entry.length > MAX_REF_LENGTH) return false;
    }
  }
  return true;
```

- [ ] **Step 8: Run schema tests**

```bash
node --test tests/b148-schema-v7.test.js 2>&1 | tail -3
```
Expected: `tests 9 / pass 9 / fail 0`.

- [ ] **Step 9: Update existing schema-pin tests**

Find tests that pin v6 literal:
```bash
grep -rn "KNOWN_VERSION.*6\|schemaVersion.*6\|schemaVersion === 6" tests/ 2>/dev/null
```
For each match, bump the literal from 6 → 7 with a B-148 annotation comment matching the pattern from S43:
```js
test('<existing test name> (B-148 §3.1 update)', () => {
  assert.equal(KNOWN_VERSION, 7, 'updated by B-148 §3.1 v6→v7 bump');
});
```

- [ ] **Step 10: Run full suite**

```bash
npm test 2>&1 | grep -E "tests \d|pass \d|fail \d" | tail -3
```
Expected: `tests 1939 / pass 1939 / fail 0` (1930 baseline + 9 new B-148 schema tests). If existing schema-pin tests fail, fix per Step 9.

- [ ] **Step 11: Commit**

```bash
git add background/storage/migration.js background/storage/shapes.js tests/b148-schema-v7.test.js tests/sync-schema-v5.test.js tests/migration-fresh-install.test.js tests/migration-steps.test.js
git commit -m "feat: B-148 §3.1 + §3.2 — schema v6→v7 bump + isGroup renderOrder validator

KNOWN_VERSION 6→7. New no-op MIGRATION_STEPS v6→v7. defaultShape
literal bumped paired (per C-1a paired-bump invariant). isGroup
validator accepts optional renderOrder: string[] of prefix-encoded refs
(item:<id> / floating:<id>) with per-entry length cap 64.

Tests: tests/b148-schema-v7.test.js (9 cases). Pre-existing schema-pin
tests updated for v7. +9 net.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extend `validateGroupPatch` allow-list + per-element validator

**Files:**
- Modify: `background/storage/groups.js:108-136` (`validateGroupPatch`)
- Test: extend `tests/b148-schema-v7.test.js` with patch-validator tests.

- [ ] **Step 1: Write failing tests**

Append to `tests/b148-schema-v7.test.js`:
```js
import { createGroup, updateGroup } from '../background/storage/groups.js';

test('B-148 §3.3: updateGroup accepts renderOrder in patch + persists it', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const updated = await updateGroup(g.id, { renderOrder: ['item:01HZ'] });
  assert.deepEqual(updated.renderOrder, ['item:01HZ']);
});

test('B-148 §3.3: updateGroup rejects renderOrder of wrong type', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await assert.rejects(
    () => updateGroup(g.id, { renderOrder: 'item:01HZ' }),
    (err) => err.message.includes('renderOrder'),
  );
});

test('B-148 §3.3: updateGroup rejects renderOrder entry with bad prefix', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await assert.rejects(
    () => updateGroup(g.id, { renderOrder: ['url:bad'] }),
    (err) => err.message.includes('renderOrder'),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/b148-schema-v7.test.js 2>&1 | tail -3
```
Expected: 3 new fails.

- [ ] **Step 3: Extend `validateGroupPatch`**

Edit `background/storage/groups.js`. Find `validateGroupPatch` (around line 108). Append `'renderOrder'` to allowed array, then append validator block:
```js
  const allowed = ['name', 'color', 'parentId', 'sortOrder', 'collapsed', 'chromeTabGroupId', 'renderOrder'];
  // …existing for-loop…

  // …existing validator blocks…

  /* B-148 §3.3 — OPTIONAL renderOrder patch. Same per-element validation as
     isGroup (background/storage/shapes.js#isGroup). Mirror to share rules. */
  if ('renderOrder' in patch) {
    if (!Array.isArray(patch.renderOrder)) {
      throw new StorageError(ERR_VALIDATION, 'updateGroup: renderOrder must be array');
    }
    for (const entry of patch.renderOrder) {
      if (typeof entry !== 'string' || entry.length === 0) {
        throw new StorageError(ERR_VALIDATION, 'updateGroup: renderOrder entry must be non-empty string');
      }
      if (!entry.startsWith('item:') && !entry.startsWith('floating:')) {
        throw new StorageError(ERR_VALIDATION, 'updateGroup: renderOrder entry must be prefixed item: or floating:');
      }
      if (entry.length > 64) {
        throw new StorageError(ERR_VALIDATION, 'updateGroup: renderOrder entry exceeds maximum length');
      }
    }
  }
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/b148-schema-v7.test.js 2>&1 | tail -3
```
Expected: `tests 12 / pass 12 / fail 0`.

- [ ] **Step 5: Commit**

```bash
git add background/storage/groups.js tests/b148-schema-v7.test.js
git commit -m "feat: B-148 §3.3 — validateGroupPatch accepts renderOrder

updateGroup allow-list extended with renderOrder. Per-element validator
mirrors isGroup checks (string, non-empty, prefix item: or floating:,
length <=64). 3 new patch-validator tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Create `shared/render-order.js` resolver (pure function, TDD)

**Files:**
- Create: `shared/render-order.js`
- Create: `tests/b148-render-order-resolver.test.js`
- Delete: `tests/b148-r0-spike-multi-partition.test.js` + `tests/b148-r0-spike-bootstrap-perf.test.js` (R0 spike done)

- [ ] **Step 1: Write failing resolver tests**

Create `tests/b148-render-order-resolver.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRenderOrder } from '../shared/render-order.js';

function group(extra = {}) {
  return Object.assign({
    id: 'g1', name: 'G', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}
function item(id, sortOrder, groupId = 'g1') {
  return { id, title: 'T'+id, url: 'https://x.example/'+id, groupId, sortOrder, createdAt: 1, updatedAt: 1 };
}
function floating(floatingTabId, sortOrder) {
  return { floatingTabId, tabId: 1000 + sortOrder, sortOrder };
}

test('B-148 T1: empty group → empty result', () => {
  assert.deepEqual(resolveRenderOrder(group(), [], []), []);
});

test('B-148 T2: items only, no renderOrder → bootstrap by Item.sortOrder asc', () => {
  const items = [item('A', 1), item('B', 0), item('C', 2)];
  const result = resolveRenderOrder(group(), items, []);
  assert.deepEqual(result.map((r) => r.ref), ['item:B', 'item:A', 'item:C']);
});

test('B-148 T3: floating only, no renderOrder → bootstrap by sortOrder asc', () => {
  const fm = [floating('F2', 1), floating('F1', 0)];
  const result = resolveRenderOrder(group(), [], fm);
  assert.deepEqual(result.map((r) => r.ref), ['floating:F1', 'floating:F2']);
});

test('B-148 T4: mixed, no renderOrder → bootstrap saved-then-floating', () => {
  const items = [item('A', 0)];
  const fm = [floating('F1', 0)];
  const result = resolveRenderOrder(group(), items, fm);
  assert.deepEqual(result.map((r) => r.ref), ['item:A', 'floating:F1']);
});

test('B-148 T5: mixed, renderOrder present, all refs resolve → returns ordered display', () => {
  const items = [item('A', 0), item('B', 1)];
  const fm = [floating('F1', 0)];
  const g = group({ renderOrder: ['item:B', 'floating:F1', 'item:A'] });
  const result = resolveRenderOrder(g, items, fm);
  assert.deepEqual(result.map((r) => r.ref), ['item:B', 'floating:F1', 'item:A']);
});

test('B-148 T6: renderOrder present, stale item ref → filtered silently', () => {
  const items = [item('A', 0)];
  const g = group({ renderOrder: ['item:GHOST', 'item:A'] });
  const result = resolveRenderOrder(g, items, []);
  assert.deepEqual(result.map((r) => r.ref), ['item:A']);
});

test('B-148 T7: renderOrder present, stale floating ref → filtered silently', () => {
  const fm = [floating('F1', 0)];
  const g = group({ renderOrder: ['floating:GHOST', 'floating:F1'] });
  const result = resolveRenderOrder(g, [], fm);
  assert.deepEqual(result.map((r) => r.ref), ['floating:F1']);
});

test('B-148 T8: result rows carry resolved item / floating member', () => {
  const it = item('A', 0);
  const fm = floating('F1', 0);
  const g = group({ renderOrder: ['item:A', 'floating:F1'] });
  const result = resolveRenderOrder(g, [it], [fm]);
  assert.equal(result[0].kind, 'item');
  assert.equal(result[0].item, it);
  assert.equal(result[1].kind, 'floating');
  assert.equal(result[1].floatingMember, fm);
});

test('B-148 T9: bootstrap dedupes if same id appears in both items + floating (defensive)', () => {
  /* Edge case: theoretically impossible (item.id and floatingTabId namespaces
     are distinct ulids), but the resolver should not double-count. */
  const items = [item('A', 0)];
  const fm = [floating('A', 0)]; /* same string, different namespace */
  const result = resolveRenderOrder(group(), items, fm);
  assert.equal(result.length, 2);
  assert.equal(result[0].ref, 'item:A');
  assert.equal(result[1].ref, 'floating:A');
});

test('B-148 T10: items NOT in this group are ignored at bootstrap', () => {
  const items = [item('A', 0, 'g1'), item('B', 0, 'g2')];
  const result = resolveRenderOrder(group({ id: 'g1' }), items, []);
  /* Caller is responsible for pre-filtering to group; resolver doesn't
     re-filter. This test pins that contract — resolver TRUSTS its inputs. */
  assert.deepEqual(result.map((r) => r.ref), ['item:A', 'item:B']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/b148-render-order-resolver.test.js 2>&1 | tail -5
```
Expected: import error — module does not exist.

- [ ] **Step 3: Create the resolver module**

Create `shared/render-order.js`:
```js
/**
 * shared/render-order.js — pure resolver for B-148 interleaved render order.
 *
 * Authoritative spec: docs/superpowers/specs/2026-05-03-interleave-render-
 * order-design.md §3.4.
 *
 * Pure function: no chrome.* calls, no storage reads, no side effects.
 * Caller pre-filters items + floatingMembers to the target group; resolver
 * trusts the inputs.
 *
 * Returns an ordered array of `{ kind, ref, item?, floatingMember? }`
 * descriptors. The render-path renders in this order.
 *
 * Bootstrap path (renderOrder missing or empty): produce the saved-then-
 * floating fallback by Item.sortOrder asc, then FloatingGroup.sortOrder asc.
 * Caller is responsible for persisting the bootstrapped value back via
 * updateGroup({renderOrder: ...}) so the next call sees the persisted form.
 *
 * Stale-ref handling: refs that don't resolve to any item or floating
 * member are filtered silently (rendered as nothing). The cold-start sweep
 * at reassociateFloatingGroups (Task 9) strips stale refs from disk.
 *
 * @typedef {Object} RenderRow
 * @property {'item'|'floating'} kind
 * @property {string} ref         — `item:<id>` or `floating:<floatingTabId>`
 * @property {Object} [item]      — populated when kind === 'item'
 * @property {Object} [floatingMember] — populated when kind === 'floating'
 */

const PREFIX_ITEM = 'item:';
const PREFIX_FLOATING = 'floating:';

/**
 * @param {{ id: string, renderOrder?: string[] }} group
 * @param {Array<{ id: string, sortOrder: number }>} groupItems
 * @param {Array<{ floatingTabId: string, sortOrder: number }>} groupFloatingMembers
 * @returns {RenderRow[]}
 */
export function resolveRenderOrder(group, groupItems, groupFloatingMembers) {
  const itemById = new Map();
  for (const it of groupItems) itemById.set(it.id, it);
  const floatingById = new Map();
  for (const fm of groupFloatingMembers) floatingById.set(fm.floatingTabId, fm);

  const renderOrder = Array.isArray(group?.renderOrder) ? group.renderOrder : null;
  if (renderOrder && renderOrder.length > 0) {
    const out = [];
    for (const ref of renderOrder) {
      if (typeof ref !== 'string') continue;
      if (ref.startsWith(PREFIX_ITEM)) {
        const id = ref.slice(PREFIX_ITEM.length);
        const item = itemById.get(id);
        if (item) out.push({ kind: 'item', ref, item });
      } else if (ref.startsWith(PREFIX_FLOATING)) {
        const id = ref.slice(PREFIX_FLOATING.length);
        const floatingMember = floatingById.get(id);
        if (floatingMember) out.push({ kind: 'floating', ref, floatingMember });
      }
    }
    return out;
  }

  /* Bootstrap fallback — saved-then-floating, each by sortOrder asc. */
  const out = [];
  const sortedItems = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const it of sortedItems) {
    out.push({ kind: 'item', ref: PREFIX_ITEM + it.id, item: it });
  }
  const sortedFm = [...groupFloatingMembers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const fm of sortedFm) {
    out.push({ kind: 'floating', ref: PREFIX_FLOATING + fm.floatingTabId, floatingMember: fm });
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/b148-render-order-resolver.test.js 2>&1 | tail -3
```
Expected: `tests 10 / pass 10 / fail 0`.

- [ ] **Step 5: Run full suite**

```bash
npm test 2>&1 | grep -E "tests \d|pass \d|fail \d" | tail -3
```
Expected: prior + 10 (no regressions).

- [ ] **Step 6: Delete R0 spike test files**

```bash
rm tests/b148-r0-spike-multi-partition.test.js tests/b148-r0-spike-bootstrap-perf.test.js
```

- [ ] **Step 7: Commit**

```bash
git add shared/render-order.js tests/b148-render-order-resolver.test.js
git rm tests/b148-r0-spike-multi-partition.test.js tests/b148-r0-spike-bootstrap-perf.test.js 2>/dev/null || true
git commit -m "feat: B-148 §3.4 — shared/render-order.js resolver (pure function)

Pure resolveRenderOrder(group, items, floatingMembers) returns ordered
RenderRow[] from group.renderOrder, with bootstrap fallback to saved-
then-floating-by-sortOrder when renderOrder is missing/empty. Stale
refs filtered silently.

10 unit tests in tests/b148-render-order-resolver.test.js cover empty,
items-only, floating-only, mixed-no-renderOrder bootstrap, mixed-with-
renderOrder happy path, stale-item-ref, stale-floating-ref, kind/ref/
member descriptors, namespace dedup, caller-trust contract.

R0 spike A + B test files removed — spike outcomes documented in plan-
execution log: A PASS (multi-partition atomic), B PASS (bootstrap perf
within budget for 20×50×50 profile).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Multi-partition write site updates — items.js (Tasks 8a–8e)

Each of the 5 items.js write sites gets one TDD task. Pattern is consistent: write failing test asserting renderOrder side-effect, run, implement multi-partition writeTransaction, run, full suite, commit.

The full pattern (repeated 5× with site-specific test setup):

### Task 8a — `createItem` appends `item:<newId>` to target Group's renderOrder

**Files:** Modify `background/storage/items.js` (createItem); test `tests/b148-renderorder-write-paths.test.js`.

- [ ] **Step 1: Write failing integration test**

Create `tests/b148-renderorder-write-paths.test.js`:
```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock } from './chrome-mock.js';
import { createGroup, getGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';

beforeEach(async () => __resetMock());

test('B-148 8a: createItem appends item:<id> to target Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8a: createItem with no groupId (Ungrouped) does NOT touch any group', async () => {
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: null, sortOrder: 0 });
  /* Just verify no throw — Ungrouped items don't have a Group to update. */
  assert.equal(it.groupId, null);
});

test('B-148 8a: two createItem calls in same group append in order', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'T1', url: 'https://x.example/1', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'T2', url: 'https://x.example/2', groupId: g.id, sortOrder: 1 });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it1.id, 'item:' + it2.id]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/b148-renderorder-write-paths.test.js 2>&1 | tail -3
```
Expected: 3 fails (renderOrder is undefined).

- [ ] **Step 3: Modify createItem to multi-partition writeTransaction**

Edit `background/storage/items.js#createItem`. Find the existing writeTransaction call. Currently writes only PARTITION_ITEMS. Extend to also touch PARTITION_GROUPS when `input.groupId` is non-null:

```js
export async function createItem(input) {
  validateNewItem(input);
  const normalizedUrl = validateNewItem(input);
  // …existing item-shape construction…

  const ops = [{
    partition: PARTITION_ITEMS,
    mutator: (items) => {
      // …existing logic…
      return [...items, stored];
    },
  }];

  /* B-148 §3.5 — append item:<newId> to target Group.renderOrder. Skips
     when groupId is null (Ungrouped items don't belong to any group). */
  if (stored.groupId !== null) {
    ops.push({
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        const idx = groups.findIndex((g) => g.id === stored.groupId);
        if (idx < 0) return groups; // group missing — defensive; createItem already validates
        const g = groups[idx];
        const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
        renderOrder.push('item:' + stored.id);
        const next = [...groups];
        next[idx] = { ...g, renderOrder, updatedAt: Date.now() };
        return next;
      },
    });
  }
  await writeTransaction(ops);
  return created;
}
```

- [ ] **Step 4: Run tests**

```bash
node --test tests/b148-renderorder-write-paths.test.js 2>&1 | tail -3
```
Expected: `tests 3 / pass 3 / fail 0`.

- [ ] **Step 5: Full suite**

```bash
npm test 2>&1 | grep -E "tests \d|pass \d|fail \d" | tail -3
```
Expected: no regressions; +3 net.

- [ ] **Step 6: Commit**

```bash
git add background/storage/items.js tests/b148-renderorder-write-paths.test.js
git commit -m "feat: B-148 §3.5 — createItem appends item:<id> to target Group.renderOrder

Multi-partition writeTransaction: PARTITION_ITEMS + PARTITION_GROUPS
when input.groupId is non-null. Ungrouped items skip the Group write.

Tests: 3 cases in tests/b148-renderorder-write-paths.test.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8b — `deleteItem` strips `item:<id>` from owning Group's renderOrder

**Files:** Modify `background/storage/items.js#deleteItem`. Test in `tests/b148-renderorder-write-paths.test.js`.

Same TDD pattern. Append to test file:
```js
test('B-148 8b: deleteItem strips item:<id> from owning Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { deleteItem } = await import('../background/storage/items.js');
  await deleteItem(it.id);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, []);
});
```

Implementation: extend `deleteItem`'s writeTransaction with a PARTITION_GROUPS mutator that strips the `item:<id>` ref from the owning group's renderOrder.

Steps 1-6 follow the Task 8a template.

---

### Task 8c — `updateItem({groupId})` strips from source + appends to target

**Files:** Modify `background/storage/items.js#updateItem`. Test in `tests/b148-renderorder-write-paths.test.js`.

Append test:
```js
test('B-148 8c: updateItem({groupId}) strips from source + appends to target Group renderOrder', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: gA.id, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { groupId: gB.id });
  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.deepEqual(gAAfter.renderOrder, []);
  assert.deepEqual(gBAfter.renderOrder, ['item:' + it.id]);
});
```

Implementation: in `updateItem`, when patch.groupId differs from current item.groupId, the writeTransaction now includes PARTITION_GROUPS mutator that:
1. Strips `item:<id>` from source group's renderOrder (if source.groupId was non-null)
2. Appends `item:<id>` to target group's renderOrder (if target.groupId is non-null)

Same TDD step pattern.

---

### Task 8d — `bulkCreateItems` appends N refs in one transaction

**Files:** Modify `background/storage/items.js#bulkCreateItems`. Test in `tests/b148-renderorder-write-paths.test.js`.

Append test:
```js
test('B-148 8d: bulkCreateItems appends multiple item:<id> refs to target Group renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const { bulkCreateItems } = await import('../background/storage/items.js');
  const result = await bulkCreateItems({
    items: [
      { title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 },
      { title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 },
      { title: 'C', url: 'https://x.example/C', groupId: g.id, sortOrder: 2 },
    ],
  });
  const groupAfter = await getGroup(g.id);
  assert.equal(groupAfter.renderOrder.length, 3);
  for (const item of result.items) {
    assert.ok(groupAfter.renderOrder.includes('item:' + item.id));
  }
});
```

Implementation: extend the existing bulkCreateItems writeTransaction with a PARTITION_GROUPS mutator that appends all newly-created `item:<id>` refs to the appropriate Group(s)' renderOrders. Group items by groupId for efficient batch update.

Same TDD step pattern.

---

### Task 8e — `bulkDeleteItems` strips N refs in one transaction

**Files:** Modify `background/storage/items.js#bulkDeleteItems`. Test in `tests/b148-renderorder-write-paths.test.js`.

Append test:
```js
test('B-148 8e: bulkDeleteItems strips multiple item:<id> refs from owning Group renderOrders', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 });
  const { bulkDeleteItems } = await import('../background/storage/items.js');
  await bulkDeleteItems({ ids: [it1.id, it2.id] });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, []);
});
```

Implementation: extend bulkDeleteItems writeTransaction with PARTITION_GROUPS mutator stripping all deleted ids' refs.

Same TDD step pattern.

---

## Task 9: Floating-groups write site updates (Tasks 9a-9d)

Same TDD pattern, each appending one or more tests to `tests/b148-renderorder-write-paths.test.js`.

### Task 9a — `appendFloatingGroup` appends `floating:<id>`

Test: append a floating record; assert target Group.renderOrder gains the `floating:<floatingTabId>` ref.

Implementation: extend `appendFloatingGroup` writeTransaction with PARTITION_GROUPS mutator.

### Task 9b — `moveFloatingTab` strips source + appends target (cross-group)

Test: cross-group move; assert source.renderOrder shrinks, target.renderOrder grows.

Implementation: in moveFloatingTab, when sourceGroupId !== null AND targetGroupId !== null AND they differ → PARTITION_GROUPS mutator updates both. When ATTACH (source null) → only target. When DETACH (target null) → only source.

### Task 9c — `pruneFloatingGroupsByLiveTabId` + `pruneFloatingGroupsByParentItemId` strip stale refs

Test: close a tab, prune fires, assert renderOrder is updated.

Implementation: extend the prune writeTransactions. The tricky bit: prune is called from chrome.tabs.onRemoved; needs to update potentially many groups (one per affected floating record). Group the strips by groupId for efficient batch.

### Task 9d — `MSG_REORDER_FLOATING_MEMBERS` SW handler updates renderOrder

Test: dispatch the message with a new renderOrder array; assert Group.renderOrder is written.

Implementation per R0 spike C decision (Option A — full array): handler validates payload.renderOrder, writes to PARTITION_GROUPS via writeTransaction. Existing PARTITION_FLOATING_GROUPS write retained for legacy sortOrder fallback.

Each is a separate task with the standard TDD pattern (write test, run-fail, implement, run-pass, commit).

---

## Task 10: `importCollection` replace mode clears + bootstraps renderOrder

**Files:** Modify `background/import/import-collection.js`. Test in `tests/b148-renderorder-write-paths.test.js`.

- [ ] Write failing test asserting that after import-replace, every imported group's renderOrder is bootstrapped from the imported items' sortOrder.
- [ ] Implement: extend the import-replace writeTransaction to clear all `tj:groups` renderOrders, then bootstrap from imported items + floating-tab records.
- [ ] Same TDD step pattern.

---

## Task 11: Cold-start `reassociateFloatingGroups` extends to bootstrap + sweep

**Files:** Modify `background/tabs/tab-claims.js#reassociateFloatingGroups`. Create `tests/b148-cold-start-bootstrap.test.js`.

- [ ] **Step 1: Write failing tests**

Create `tests/b148-cold-start-bootstrap.test.js` with cases:
- Legacy v6 group (no renderOrder) → reassociateFloatingGroups derives from items + floating sortOrder
- Group with stale `item:` ref → ref stripped
- Group with stale `floating:` ref → ref stripped
- Group already at v7 with valid renderOrder → unchanged

- [ ] **Step 2: Implement**

Extend `reassociateFloatingGroups` writeTransaction. Add a PARTITION_GROUPS mutator (same writeTransaction):
- For each group: if renderOrder missing/empty, derive from items + floating (per resolver bootstrap rule). If present, filter out refs that don't resolve.

- [ ] Steps 3-6 follow the standard TDD pattern.

---

## Task 12: Sidepanel render path consumes resolver

**Files:** Modify `sidepanel/sidepanel.js` render path.

- [ ] **Step 1: Find existing render call site**

```bash
grep -n "buildItemRow\|buildFloatingTabRow\|saved.*then.*floating\|renderGroup" sidepanel/sidepanel.js | head -10
```

- [ ] **Step 2: Replace dual-iteration with resolver call**

Replace the existing "render all saved items, then render all floating members" pattern with:
```js
import { resolveRenderOrder } from '../shared/render-order.js';
// …
for (const group of topLevelGroups) {
  const groupItems = items.filter((it) => it.groupId === group.id);
  const groupFm = (floatingMembers && floatingMembers[group.id]) || [];
  const rows = resolveRenderOrder(group, groupItems, groupFm);
  for (const row of rows) {
    if (row.kind === 'item') {
      sectionEl.appendChild(buildItemRow(row.item, …));
    } else {
      sectionEl.appendChild(buildFloatingTabRow(row.floatingMember));
    }
  }
}
```

- [ ] **Step 3: Add static-source pin test**

Append to `tests/b148-render-order-resolver.test.js`:
```js
test('B-148 §3.7: sidepanel.js imports + uses resolveRenderOrder', () => {
  const src = readFileSync(join(__dirname, '..', 'sidepanel/sidepanel.js'), 'utf8');
  assert.match(src, /import \{[^}]*resolveRenderOrder[^}]*\} from .*shared\/render-order/);
  assert.match(src, /resolveRenderOrder\(group/);
});
```

- [ ] **Step 4: Run full suite**

Pre-existing sidepanel tests may pin the dual-iteration order. Update them to expect resolver output.

- [ ] **Step 5: Commit.**

---

## Task 13: Sidepanel drag hit-test extends to mixed-type insert positions

**Files:** Modify `sidepanel/sidepanel.js` `_buildTabDragRectCache` + `_computeTabDropTarget` + `_computeStripInsertIndex` (for B-156 parity).

- [ ] Write failing tests in `tests/b148-mixed-type-drag.test.js` covering:
  - Drag floating tab between two saved items → insert position computed against the mixed midline list
  - Drag saved item between two floating tabs → same
  - Drag onto group header (B-157 expansion already in place) → insertIndex = 0 against mixed list

- [ ] Modify `_buildTabDragRectCache` floating-zone enumeration:
  - Currently enumerates `:scope > .item-row[data-floating="true"]` only.
  - With B-148: enumerate ALL `:scope > .item-row` rows in the group (any data-tab-id OR data-item-id child of `.group-items`).
  - Each row's midline + ref (`item:<id>` or `floating:<id>`) goes into the cluster's rowMidlines + rowRefs arrays.

- [ ] Modify `_computeTabDropTarget` floating-zone branch:
  - Index calc still uses Y vs midlines (unchanged math).
  - InsertIndex now refers to the mixed sequence position.

- [ ] Modify drop dispatcher to compute new renderOrder and dispatch MSG_REORDER_FLOATING_MEMBERS with full renderOrder array per R0 spike C.

- [ ] Same TDD step pattern; commit.

---

## Task 14: Newtab render path consumes resolver

**Files:** Modify `newtab/newtab.js`.

- [ ] Identical pattern to Task 12, but for newtab. No drag UX in newtab (out of spec scope) — read-only resolver consumption.

- [ ] Static-source pin test asserting newtab imports + uses resolveRenderOrder.

- [ ] Commit.

---

## Task 15: UAT script

**Files:** Create `docs/UAT_B-148.md` with the 10-15 cases from spec §5.3.

- [ ] Mirror the established UAT structure (Setup, Tester instructions, per-case Priority + PASS/FAIL criteria + AC mapping). Reference: `docs/UAT_B-041.md` or `docs/UAT_B-137.md`.

- [ ] Edge-specific paths (`edge://extensions`, etc.).

- [ ] Commit.

---

## Task 16: Manifest version bump + CHANGELOG + RELEASES

**Files:** Modify `manifest.json`, `CHANGELOG.md`, `docs/RELEASES.md`.

- [ ] Version bump 1.38.x → 1.39.0 (schema bump warrants minor bump).

- [ ] CHANGELOG entry covering: B-148 interleave feature, schema v6→v7 lazy migration, SW flush note, test count delta.

- [ ] RELEASES mirror.

- [ ] Commit.

---

## Task 17: Final verification + PR + merge + tag

**Files:** None modified.

- [ ] **Step 1: Final test suite green**

```bash
npm test 2>&1 | grep -E "tests \d|pass \d|fail \d" | tail -3
```
Expected: 1930 baseline + ~50 new tests = ~1980 PASS.

- [ ] **Step 2: Build clean**

```bash
./build.sh 2>&1 | tail -5
```

- [ ] **Step 3: Commit log review**

```bash
git log --oneline release/v2..HEAD
```
Expected: ~17 task commits + a final progress chore commit.

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/sprint-44-interleave
```

- [ ] **Step 5: Create PR**

```bash
gh pr create --base release/v2 --title "Sprint 44 anchor — B-148 interleave (schema v7, renderOrder per group) → v1.39.0" --body "Sprint 44 anchor B-148 — interleave floating tabs with saved bookmarks per group. Schema v6→v7 lazy migration adds Group.renderOrder. New shared/render-order.js resolver. 12 multi-partition write sites updated. Sidepanel + newtab render paths use resolver. Cold-start bootstrap via reassociateFloatingGroups extension. Tests: ~+50 net. Full notes in CHANGELOG.md."
```

- [ ] **Step 6: Merge + tag (after user verification)**

User approves → merge + tag v1.39.0 + push tag, per established pattern (skip `gh release create`).

---

## Self-Review Notes

**Spec coverage:**
- §1 Goal — Tasks 12, 13, 14 (UI consumption); Tasks 8-11 (storage)
- §2 Decision log — encoded throughout (Q1 in Task 5, Q2 in Tasks 9a-9c, Q3 in Task 13, Q4 in Tasks 8-11, Q5 in Task 14, Q6 in Task 11 cold-start, Q7 no code change needed)
- §3.1 Schema bump — Task 5
- §3.2 isGroup validator — Task 5
- §3.3 validateGroupPatch — Task 6
- §3.4 Resolver — Task 7
- §3.5 Multi-partition write sites — Tasks 8a-e, 9a-d, 10
- §3.6 Cold-start bootstrap — Task 11
- §3.7 Render-path consumption — Tasks 12, 14
- §3.8 Drag-flow contract — Tasks 9d, 13
- §3.9 No new permissions — implicit; nothing added in any task
- §4 Migration — Task 5 (schema bump) + Task 11 (bootstrap)
- §5 Test plan — distributed across all tasks; UAT in Task 15
- §6 Tier rationale — encoded in plan structure (R0 spike Tasks 2-4, then implementation Tasks 5-14)
- §7 Risks — risk #2 (perf) covered by R0 spike B (Task 3); risk #3 (writeTransaction atomicity) covered by R0 spike A (Task 2); risk #5 (wire format) covered by R0 spike C (Task 4)
- §8 Out of scope — implicitly absent from tasks
- §9 AC preview — formalized at sprint kickoff; this plan implements ACs 1-9; AC 10 (UAT PASS) is Task 15 + execution
- §10 References — informational

**Placeholder scan:** Tasks 8b/c/d/e and 9a/b/c/d use abbreviated TDD step descriptions ("same TDD step pattern" / "Steps 3-6 follow the standard TDD pattern") rather than repeating the full 6-step expansion. This is intentional — Task 8a establishes the canonical pattern; subsequent variants would be near-verbatim copies. The implementing engineer is expected to follow the explicit pattern from 8a. If subagent-driven execution requires fully-expanded steps for each variant, that's a 30-minute expansion — flag during dispatch.

**Type consistency:**
- `RenderRow` / `resolveRenderOrder` / `renderOrder` field name consistent throughout
- Prefix encoding `item:<id>` / `floating:<id>` consistent (matches recency partition's prefix convention)
- Multi-partition writeTransaction shape (`[{partition, mutator}, ...]`) consistent across all write-site tasks

**Decisions deferred to R0 (in plan, not spec):**
- Spike A outcome → atomicity confirmed (default assumption); fallback would be plan amendment
- Spike B outcome → perf within budget (default eager bootstrap); fallback to lazy per-group bootstrap is a separate Task 11 variant
- Spike C outcome → Option A (full renderOrder array per drag); reflected in Tasks 9d, 13

If an R0 spike outcome differs from the default assumption, the plan above needs amendment before proceeding. The R0 spike tasks (2-4) explicitly STOP-and-escalate on adverse outcomes.
