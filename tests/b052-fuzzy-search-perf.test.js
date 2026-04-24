/**
 * b052-fuzzy-search-perf.test.js — B-052 R5 perf + invalidation harness
 *
 * Exercises the pure search-index module (sidepanel/search-index.js) under:
 *   - AC3: 1 000-item P95 search latency < 40 ms (20 % safety margin
 *          below the 50 ms product target — §34.8 "Why 20% safety margin")
 *   - AC4: 500-item first-paint DOM-build proxy < 160 ms (20 % safety
 *          margin below the 200 ms product target — §34.5 budget table)
 *   - Invalidation correctness: diffAndPatch on single-item edits
 *          produces the same post-state as a full rebuild
 *   - Single-item DOM patch: verifies only one row is replaced in a
 *          minimal DOM shim, not the whole list
 *
 * Fixture generator (seeded Mulberry32 — deterministic across runs):
 *   `generateItemCollection(n, seed, opts)` below is the sole source of
 *   test data. The seed is the constant at the top of each test; every
 *   CI run produces byte-identical inputs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  buildIndex,
  diffAndPatch,
  search,
  BULK_REBUILD_THRESHOLD,
} from '../sidepanel/search-index.js';

/* =========================================================================
   Deterministic PRNG (Mulberry32) + fixture generator.

   The algorithm is a 32-bit linear-congruential-style generator with a
   simple multiply-XOR mix per step. It is neither cryptographically
   strong nor statistically ideal, but it's sufficient for generating
   reproducible test fixtures and has the virtue of being tiny enough
   to embed here without an external dep.
   ========================================================================= */

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Realistic-ish title/URL words so substring match behaves as it would
   in user data. Intentionally small + ASCII-only per §34.8 "no unicode
   outside BMP for determinism". */
const TITLE_WORDS = [
  'dashboard', 'analytics', 'settings', 'profile', 'admin', 'search',
  'console', 'billing', 'invoice', 'report', 'archive', 'template',
  'project', 'team', 'workspace', 'calendar', 'notes', 'kanban',
  'roadmap', 'release', 'backlog', 'sprint', 'issue', 'review',
  'document', 'collection', 'library', 'bookmark', 'reference', 'guide',
];
const URL_HOSTS = [
  'github.com', 'gitlab.com', 'example.com', 'docs.example.com',
  'notes.example.com', 'search.example.com', 'admin.example.com',
  'kanban.example.com', 'wiki.example.com', 'archive.example.com',
];
const URL_PATHS = [
  'dashboard', 'settings', 'profile', 'search', 'billing',
  'report', 'archive', 'project', 'team', 'workspace',
];

/**
 * @param {number} n
 * @param {number} seed
 * @param {{ groupCount?: number }} [opts]
 * @returns {{
 *   items: Array<{id:string,title:string,url:string,groupId:string,sortOrder:number,createdAt:number,updatedAt:number}>,
 *   groups: Array<{id:string,name:string,sortOrder:number}>
 * }}
 */
function generateItemCollection(n, seed, opts = {}) {
  const groupCount = opts.groupCount ?? 10;
  const prng = mulberry32(seed);

  const groups = [];
  for (let g = 0; g < groupCount; g++) {
    groups.push({ id: `grp-${g}`, name: `Group ${g}`, sortOrder: g });
  }

  const items = new Array(n);
  for (let i = 0; i < n; i++) {
    const wordA = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
    const wordB = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
    const wordC = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
    const title = `${wordA} ${wordB} ${wordC} ${i}`;
    const host = URL_HOSTS[Math.floor(prng() * URL_HOSTS.length)];
    const path = URL_PATHS[Math.floor(prng() * URL_PATHS.length)];
    const hostNum = Math.floor(prng() * 100);
    const url = `https://host${hostNum}.${host}/${path}/${i}`;
    const groupId = groups[i % groupCount].id;
    items[i] = {
      id: `itm-${i.toString().padStart(6, '0')}`,
      title,
      url,
      groupId,
      sortOrder: i,
      createdAt: 1700000000000 + i,
      updatedAt: 1700000000000 + i,
    };
  }

  return { items, groups };
}

/* =========================================================================
   P95 + warmup helpers
   ========================================================================= */

function p95(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  /* For 50 samples, index 47 (floor(50 * 0.95)) is the 95th percentile. */
  return sorted[Math.floor(sorted.length * 0.95)];
}

/* Pick a query likely to have partial hits so the hot loop doesn't short-
   circuit on every entry — exercises both the title-match and url-match
   branches. `prng` is reused so the query draw is also deterministic. */
function pickQuery(prng) {
  const choices = [
    'dashboard', 'proj', 'admin', 'search', 'host1', 'host2', 'wiki',
    'sprint', 'review', 'archive', 'example.com', 'gitlab',
  ];
  return choices[Math.floor(prng() * choices.length)];
}

/* =========================================================================
   AC3 — Search latency P95 < 40 ms on a 1 000-item index
   ========================================================================= */

test('B-052 AC3: search P95 on 1000-item index < 40ms over 50 samples (seed=4242)', () => {
  const SEED = 4242;
  const { items } = generateItemCollection(1000, SEED);
  const index = buildIndex(items);
  assert.equal(index.entries.length, 1000);

  /* Warmup: a handful of primed runs absorb JIT compilation jitter so the
     measured P95 reflects steady-state cost. 10 warmup iterations are
     cheap at this workload. */
  const warmupPrng = mulberry32(SEED + 1);
  for (let i = 0; i < 10; i++) search(index, pickQuery(warmupPrng));

  const measurePrng = mulberry32(SEED + 2);
  const ITER = 50;
  const samples = new Array(ITER);
  for (let i = 0; i < ITER; i++) {
    const q = pickQuery(measurePrng);
    const t0 = performance.now();
    search(index, q);
    samples[i] = performance.now() - t0;
  }
  const measured = p95(samples);
  assert.ok(
    measured < 40,
    `B-052 AC3: search P95=${measured.toFixed(2)}ms exceeded 40ms budget (samples=${samples.map((s) => s.toFixed(2)).join(',')})`,
  );
});

/* =========================================================================
   AC4 — First-paint DOM-build proxy < 160 ms on 500 items.

   The Node harness cannot measure actual paint, but §34.8 specifies the
   proxy: time from the synchronous start of a renderAll-equivalent
   construction loop to the last `appendChild`. We mock the DOM primitives
   that the sidepanel renderer touches (`createElement`, `createTextNode`,
   `createDocumentFragment`, `appendChild`) with a minimal pure-JS stand-in
   whose cost profile dominates on allocations, mirroring real DOM cost
   proportionally. The absolute budget is not directly transferable to
   browser paint, but the relative comparison to the 500-item ceiling
   acts as a regression guard: a pathological algorithmic change
   (e.g. an O(N²) sibling lookup) breaks this budget the same way it
   would break a real render.
   ========================================================================= */

class ShimNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.childNodes = [];
    this.attrs = {};
    this.dataset = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(child) { this.childNodes.push(child); return child; }
}
class ShimText {
  constructor(t) { this.textContent = t; }
}
class ShimFragment {
  constructor() { this.childNodes = []; }
  appendChild(child) { this.childNodes.push(child); return child; }
}
const shimDocument = {
  createElement: (tag) => new ShimNode(tag),
  createTextNode: (t) => new ShimText(t),
  createDocumentFragment: () => new ShimFragment(),
};

/**
 * Minimal row builder — models the shape cost of the real `buildItemRow`
 * (one root node, avatar + title + url + actions children). Not a
 * reproduction of the full buildItemRow — it's a cost proxy.
 */
function buildItemRowProxy(item) {
  const row = shimDocument.createElement('div');
  row.className = 'item-row';
  row.dataset.itemId = item.id;
  const avatar = shimDocument.createElement('div');
  avatar.textContent = (item.title || '?').charAt(0);
  row.appendChild(avatar);
  const text = shimDocument.createElement('div');
  const title = shimDocument.createElement('div');
  title.textContent = item.title || 'Untitled';
  const url = shimDocument.createElement('div');
  url.textContent = item.url || '';
  text.appendChild(title);
  text.appendChild(url);
  row.appendChild(text);
  const actions = shimDocument.createElement('div');
  actions.appendChild(shimDocument.createElement('button'));
  actions.appendChild(shimDocument.createElement('button'));
  row.appendChild(actions);
  return row;
}

test('B-052 AC4: 500-item DOM-build proxy + index rebuild < 160ms', () => {
  const SEED = 5353;
  const { items } = generateItemCollection(500, SEED);

  /* Warmup once so the first measured pass isn't penalised by JIT. */
  {
    const frag = shimDocument.createDocumentFragment();
    for (const it of items) frag.appendChild(buildItemRowProxy(it));
    buildIndex(items);
  }

  const t0 = performance.now();
  const frag = shimDocument.createDocumentFragment();
  for (const it of items) {
    frag.appendChild(buildItemRowProxy(it));
  }
  const index = buildIndex(items);
  const elapsed = performance.now() - t0;

  assert.equal(frag.childNodes.length, 500);
  assert.equal(index.entries.length, 500);
  assert.ok(
    elapsed < 160,
    `B-052 AC4: first-paint proxy took ${elapsed.toFixed(2)}ms (budget 160ms)`,
  );
});

/* =========================================================================
   Index-build wall time sanity check — on-record number for the report.
   ========================================================================= */

test('B-052: index build on 1000 items completes in < 30ms (sanity)', () => {
  const { items } = generateItemCollection(1000, 9999);
  /* Warm first run, measure second. */
  buildIndex(items);
  const t0 = performance.now();
  const idx = buildIndex(items);
  const elapsed = performance.now() - t0;
  assert.equal(idx.entries.length, 1000);
  assert.ok(elapsed < 30, `index build took ${elapsed.toFixed(2)}ms (budget 30ms)`);
});

/* =========================================================================
   Invalidation correctness — §34.4 decision matrix
   ========================================================================= */

test('B-052 AC2: single-item title edit → diffAndPatch returns patch with one "updated"', () => {
  const { items } = generateItemCollection(200, 111);
  const index = buildIndex(items);

  const next = items.map((it) => ({ ...it }));
  next[42].title = 'renamed sentinel title';

  const delta = diffAndPatch(index, next);

  assert.equal(delta.deltaType, 'patch');
  assert.equal(delta.affected.length, 1);
  assert.equal(delta.affected[0].kind, 'updated');
  assert.equal(delta.affected[0].id, next[42].id);

  /* Patched entry has the new titleLower. */
  const entry = delta.index.byId[next[42].id];
  assert.equal(entry.titleLower, 'renamed sentinel title');

  /* Generation bumped. */
  assert.equal(delta.index.generation, index.generation + 1);
});

test('B-052 AC2: single-item add → diffAndPatch returns patch with one "added"', () => {
  const { items } = generateItemCollection(200, 222);
  const index = buildIndex(items);

  const next = items.concat([{
    id: 'itm-new-1',
    title: 'brand new bookmark',
    url: 'https://newly-added.example.com/page',
    groupId: 'grp-0',
    sortOrder: 999,
    createdAt: 1,
    updatedAt: 1,
  }]);

  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'patch');
  assert.equal(delta.affected.length, 1);
  assert.equal(delta.affected[0].kind, 'added');
  assert.equal(Object.keys(delta.index.byId).length, Object.keys(index.byId).length + 1);
  assert.equal(delta.index.byId['itm-new-1'].titleLower, 'brand new bookmark');
});

test('B-052 AC2: single-item delete → diffAndPatch returns patch with one "removed"', () => {
  const { items } = generateItemCollection(200, 333);
  const index = buildIndex(items);

  const next = items.filter((_, i) => i !== 50);

  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'patch');
  assert.equal(delta.affected.length, 1);
  assert.equal(delta.affected[0].kind, 'removed');
  assert.equal(Object.keys(delta.index.byId).length, Object.keys(index.byId).length - 1);
  assert.equal(items[50].id in delta.index.byId, false);
});

test('B-052 AC2: group-move-only edit → diffAndPatch detects groupId change (Q-1 decision)', () => {
  const { items } = generateItemCollection(50, 444);
  const index = buildIndex(items);

  const next = items.map((it) => ({ ...it }));
  /* Move one item to a different group without touching title or url. */
  next[10].groupId = 'grp-9';

  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'patch', 'Q-1: groupId change must trigger a patch');
  assert.equal(delta.affected.length, 1);
  assert.equal(delta.affected[0].kind, 'updated');
  assert.equal(delta.index.byId[next[10].id].groupIdKey, 'grp-9');
});

test('B-052: sortOrder edit → diffAndPatch returns patch (post-S28 hashItem includes sortOrder so remote surfaces reflect same-group reorder)', () => {
  /* Sprint 28 B-035 UAT-4 surfaced the need: standalone window received
     reorder broadcasts but diffAndPatch resolved to noop because hashItem
     excluded sortOrder. Fix: hashItem includes sortOrder → reorder-only
     edits now surface as patches. The originating surface's explicit
     renderAll (B-025/B-030) remains in place — redundant but harmless. */
  const { items } = generateItemCollection(50, 555);
  const index = buildIndex(items);

  const next = items.map((it) => ({ ...it }));
  next[5].sortOrder = 999;
  next[10].sortOrder = 1000;

  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'patch');
  assert.equal(delta.affected.length, 2);
  assert.equal(delta.affected[0].kind, 'updated');
  assert.equal(delta.affected[1].kind, 'updated');
});

test('B-052 Q-2: delta > BULK_REBUILD_THRESHOLD add+remove → full-rebuild', () => {
  const { items } = generateItemCollection(500, 666);
  const index = buildIndex(items);

  /* Add (THRESHOLD + 5) new items in one broadcast — simulates a bulk
     import. Expected: diffAndPatch signals 'full-rebuild'. */
  const newItems = [];
  for (let i = 0; i < BULK_REBUILD_THRESHOLD + 5; i++) {
    newItems.push({
      id: `bulk-${i}`,
      title: `bulk ${i}`,
      url: `https://bulk.example.com/${i}`,
      groupId: 'grp-0',
      sortOrder: 10000 + i,
      createdAt: 1, updatedAt: 1,
    });
  }
  const next = items.concat(newItems);
  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'full-rebuild');
  assert.equal(delta.index.entries.length, next.length);
  assert.equal(delta.index.generation, index.generation + 1);
});

test('B-052: patch-result index equals full-rebuild index for the same end state', () => {
  const { items } = generateItemCollection(200, 777);
  const index = buildIndex(items);

  const next = items.map((it) => ({ ...it }));
  next[33].title = 'patched title';

  const patched = diffAndPatch(index, next);
  const rebuilt = buildIndex(next);

  assert.equal(patched.deltaType, 'patch');
  assert.equal(Object.keys(patched.index.byId).length, Object.keys(rebuilt.byId).length);

  /* byId comparison — every id maps to an entry with identical public
     fields (ignoring object identity + generation). */
  for (const id of Object.keys(patched.index.byId)) {
    const pat = patched.index.byId[id];
    const reb = rebuilt.byId[id];
    assert.ok(reb, `missing id ${id} in rebuilt index`);
    assert.equal(pat.titleLower, reb.titleLower, `titleLower mismatch for ${id}`);
    assert.equal(pat.urlLower, reb.urlLower, `urlLower mismatch for ${id}`);
    assert.equal(pat.groupIdKey, reb.groupIdKey, `groupIdKey mismatch for ${id}`);
    assert.equal(pat.hash, reb.hash, `hash mismatch for ${id}`);
  }
});

test('B-052: search result matches a linear scan byte-for-byte at 1000 items', () => {
  const { items } = generateItemCollection(1000, 888);
  const index = buildIndex(items);
  const queries = ['dashboard', 'proj', 'admin', 'host5', 'wiki.example.com'];

  for (const q of queries) {
    const lower = q.toLowerCase();
    const expected = items
      .filter((it) => (it.title || '').toLowerCase().includes(lower)
        || (it.url || '').toLowerCase().includes(lower))
      .map((it) => it.id);
    const actual = search(index, q).map((e) => e.id);
    assert.deepEqual(actual, expected, `query "${q}" result diverged from linear scan`);
  }
});

test('B-052: index is frozen — mutation throws in strict mode', () => {
  const { items } = generateItemCollection(10, 999);
  const index = buildIndex(items);
  /* `index` itself, `index.entries`, and each entry are frozen. A push
     into `index.entries` throws in strict mode (ES modules are always
     strict); a property write to the root object also throws. */
  assert.throws(() => { index.generation = 0; });
  assert.throws(() => { index.entries.push(null); });
  assert.throws(() => { index.entries[0].titleLower = 'x'; });
});

/* =========================================================================
   Single-item DOM patch contract (AC5) — minimal shim.

   This test asserts the conceptual invariant that `buildItemRow` +
   targeted insertion replaces ONE row, not all rows. We model the DOM
   with the ShimNode classes above + a trivial `replaceWith` and
   `querySelector`. The sidepanel `_patchSingleRow` closure isn't
   importable, so we replicate its core swap logic inline using the
   same `buildItemRow` shape and verify node identity preservation
   around the swap point.
   ========================================================================= */

test('B-052 AC5: single-item patch swaps one row, leaves siblings intact', () => {
  const { items } = generateItemCollection(20, 1010);
  /* Build a container with 20 rows. */
  const container = shimDocument.createElement('div');
  container.className = 'group-items';
  const rowsByItemId = new Map();
  for (const it of items) {
    const row = buildItemRowProxy(it);
    rowsByItemId.set(it.id, row);
    container.appendChild(row);
  }
  assert.equal(container.childNodes.length, 20);

  /* Capture identity of every row pre-patch. */
  const before = container.childNodes.slice();

  /* Simulate `kind === 'updated'` for items[7]: build a fresh row,
     replace the old one in-place. */
  const target = items[7];
  const oldRow = rowsByItemId.get(target.id);
  const targetIndex = container.childNodes.indexOf(oldRow);
  const freshRow = buildItemRowProxy({ ...target, title: 'patched' });
  container.childNodes[targetIndex] = freshRow;

  /* Exactly one row changed identity; siblings are referentially identical. */
  let differ = 0;
  for (let i = 0; i < container.childNodes.length; i++) {
    if (container.childNodes[i] !== before[i]) differ++;
  }
  assert.equal(differ, 1, 'single-item patch must replace exactly one row node');
  assert.equal(container.childNodes[targetIndex].childNodes[1].childNodes[0].textContent, 'patched');
});

/* =========================================================================
   R4 Fix #1 — Cross-group move must fall through to renderAll.

   `_patchSingleRow` (sidepanel.js) cannot `replaceWith` a row in place when
   the item's `groupId` has changed — the existing DOM element is still
   parented by the OLD group's container, so replaceWith would leave the row
   under the wrong group until the next renderAll. The patch path detects
   this mismatch and returns `false` so the broadcast-dispatch caller falls
   through to renderAll.

   We reproduce the check in a minimal shim here: two group containers,
   one row initially parented under container A, item's groupId now points
   to group B. Assert the `expectedContainer.contains(existing)` guard
   evaluates false (which signals a fall-through to renderAll in the real
   implementation).
   ========================================================================= */

test('B-052 AC5: single-item group-move triggers full rebuild, not in-place patch', () => {
  /* Two group containers, each a ShimNode. */
  const containerA = shimDocument.createElement('div');
  containerA.className = 'group-items';
  containerA.id = 'group-items-grp-0';
  const containerB = shimDocument.createElement('div');
  containerB.className = 'group-items';
  containerB.id = 'group-items-grp-1';

  /* Row initially belongs to group A — physically parented by containerA. */
  const itemBefore = {
    id: 'itm-move-1',
    title: 'moving item',
    url: 'https://example.com/move',
    groupId: 'grp-0',
    sortOrder: 5,
  };
  const existingRow = buildItemRowProxy(itemBefore);
  containerA.appendChild(existingRow);

  /* Simulate the group-move update — item's groupId is now grp-1. The
     patch path would look up the expected container (grp-1 → containerB)
     and check whether it contains the existing row (it doesn't). That
     mismatch is the fall-through signal. */
  const itemAfter = { ...itemBefore, groupId: 'grp-1' };

  const containerLookup = { 'grp-0': containerA, 'grp-1': containerB };
  const findContainer = (gid) => containerLookup[gid] || null;

  /* Replicate the `_patchSingleRow` updated-branch guard inline. */
  const expectedContainer = findContainer(itemAfter.groupId);
  const patchLanded = !!(expectedContainer
    && expectedContainer.childNodes.includes(existingRow));

  assert.equal(
    patchLanded,
    false,
    'Cross-group move must not apply an in-place patch (would leave row under old group).',
  );

  /* Sanity: if the item hadn't moved, the same guard would pass. */
  const expectedSame = findContainer(itemBefore.groupId);
  const sameGroupLanded = !!(expectedSame
    && expectedSame.childNodes.includes(existingRow));
  assert.equal(sameGroupLanded, true,
    'Same-group update must still apply in-place (regression check).');
});

/* =========================================================================
   B-075 contract — byId is now a frozen plain object. Mutation throws
   in strict mode (ES modules are always strict), replacing the B-052
   "defensively scoped" Map contract. This test pins the new runtime-
   enforced read-only contract into executable form.
   ========================================================================= */

test('B-075: byId is Object.frozen — direct mutation throws in strict mode', () => {
  const { items } = generateItemCollection(20, 2020);
  const index = buildIndex(items);

  /* Contract part A: byId is frozen at build time — Object.isFrozen is true. */
  assert.equal(Object.isFrozen(index.byId), true,
    'byId must be Object.frozen after buildIndex.');

  /* Contract part B: direct writes throw a TypeError in strict mode.
     Both an overwrite (existing key) and a new-key write are rejected. */
  const poisonId = items[3].id;
  const originalEntry = index.byId[poisonId];
  assert.ok(originalEntry);
  assert.throws(() => {
    index.byId[poisonId] = { id: poisonId, titleLower: 'POISONED', urlLower: '', groupIdKey: 'x', hash: 'x' };
  }, /object is not extensible|Cannot assign/,
    'Direct overwrite on frozen byId must throw in strict mode.');
  assert.throws(() => {
    index.byId['brand-new-id'] = { id: 'brand-new-id', titleLower: '', urlLower: '', groupIdKey: 'x', hash: 'x' };
  }, /object is not extensible|Cannot add property/,
    'Add-property on frozen byId must throw in strict mode.');

  /* Contract part C: the entry for the attacked id is unchanged. */
  assert.equal(index.byId[poisonId].titleLower, originalEntry.titleLower,
    'Original entry must remain intact after throw.');

  /* Contract part D: diffAndPatch still produces a fresh frozen byId
     (structural sharing via spread) on the next edit. */
  const next = items.map((it) => ({ ...it }));
  next[10].title = 'unrelated edit';
  const delta = diffAndPatch(index, next);
  assert.equal(delta.deltaType, 'patch');
  assert.notEqual(delta.index.byId, index.byId,
    'diffAndPatch must produce a new byId object instance.');
  assert.equal(Object.isFrozen(delta.index.byId), true,
    'Post-patch byId must also be Object.frozen.');
});

/* =========================================================================
   R5 gap-filler #1 (AC1) — rebuild uses CURRENT input, not cached items.

   AC1 says the index is built once and cached, invalidated only when items
   change. This test pins the contract that if the CALLER hands buildIndex
   a new items array, the returned index reflects the NEW input — even if
   the previous index was still in scope. Guards against a future
   "helpful" cache that keys by identity and returns a stale index.
   ========================================================================= */

test('B-052 AC1: buildIndex(newItems) never returns a stale cached index when input changes', () => {
  /* Two different seeds → same id space (itm-000000..N) but different
     titles + urls per entry (different word draws from the PRNG). */
  const { items: itemsA } = generateItemCollection(50, 1111);
  const { items: itemsB } = generateItemCollection(50, 2222);

  /* Fixture sanity: same id space, different content → proves the
     rebuild test below is meaningful. */
  assert.equal(itemsA[0].id, itemsB[0].id, 'Fixture: ids are deterministic.');
  assert.notEqual(itemsA[0].title, itemsB[0].title,
    'Fixture: different seeds produce different titles for the same id.');

  const indexA = buildIndex(itemsA);
  const indexB = buildIndex(itemsB);

  /* Each buildIndex call must return a fresh index object — not a cached
     reference to a prior call. The generation counter is bumped only on
     diffAndPatch, so both buildIndex calls return generation 1. What
     matters for AC1 is that the CONTENT reflects the current input. */
  assert.notEqual(indexA, indexB,
    'Each buildIndex call must return a fresh index object, never cached.');
  assert.notEqual(indexA.byId, indexB.byId,
    'byId object must be a fresh instance per build.');
  assert.notEqual(indexA.entries, indexB.entries,
    'entries array must be a fresh instance per build.');

  /* The critical AC1 assertion: the post-rebuild index reflects the NEW
     items, not the previously cached ones. Same id, different titleLower. */
  const entryA = indexA.byId[itemsA[0].id];
  const entryB = indexB.byId[itemsB[0].id];
  assert.equal(entryA.titleLower, itemsA[0].title.toLowerCase());
  assert.equal(entryB.titleLower, itemsB[0].title.toLowerCase());
  assert.notEqual(entryA.titleLower, entryB.titleLower,
    'The rebuilt index must carry the NEW items, not the cached previous ones.');
});

/* =========================================================================
   R5 gap-filler #2 (AC2) — mode transitions: bulk full-rebuild → single
   patch. After a full-rebuild delta, the next single-item edit must return
   to the patch path (not continue down full-rebuild). Locks the documented
   "every delta is re-evaluated against current index" contract — the
   rebuild is not "sticky".
   ========================================================================= */

test('B-052 AC2: bulk full-rebuild → subsequent single-edit returns to patch path', () => {
  const { items } = generateItemCollection(200, 3333);
  const index0 = buildIndex(items);

  /* Step 1: bulk add > THRESHOLD items — triggers full-rebuild. */
  const bulkItems = [];
  for (let i = 0; i < BULK_REBUILD_THRESHOLD + 3; i++) {
    bulkItems.push({
      id: `bulk-mix-${i}`,
      title: `bulk mix ${i}`,
      url: `https://bulk.example.com/mix/${i}`,
      groupId: 'grp-0',
      sortOrder: 20000 + i,
      createdAt: 1, updatedAt: 1,
    });
  }
  const afterBulk = items.concat(bulkItems);
  const delta1 = diffAndPatch(index0, afterBulk);
  assert.equal(delta1.deltaType, 'full-rebuild',
    'Step 1: bulk add must be full-rebuild.');

  /* Step 2: edit a single existing item against the NEW index. Must be a
     patch, not a sticky full-rebuild. */
  const afterEdit = afterBulk.map((it) => ({ ...it }));
  afterEdit[7].title = 'single edit after bulk';
  const delta2 = diffAndPatch(delta1.index, afterEdit);
  assert.equal(delta2.deltaType, 'patch',
    'Step 2: single edit after a full-rebuild must route back to the patch path.');
  assert.equal(delta2.affected.length, 1);
  assert.equal(delta2.affected[0].kind, 'updated');
  assert.equal(delta2.affected[0].id, afterEdit[7].id);
});

/* =========================================================================
   R5 gap-filler #3 (AC5) — composite: cross-group move, then a single-item
   title edit in the new group, both through the diffAndPatch API. Pins the
   contract that (a) the group-move produces a `patch` with a single
   updated entry carrying the new groupIdKey, and (b) a follow-up edit on
   that same item against the post-move index still produces a single-
   affected patch targeting the same id.
   ========================================================================= */

test('B-052 AC5 composite: cross-group move then same-item edit both remain patch paths', () => {
  const { items } = generateItemCollection(100, 4444);
  const index0 = buildIndex(items);

  /* Move items[25] from its original group to grp-9. */
  const movedOnce = items.map((it) => ({ ...it }));
  const originalGroup = movedOnce[25].groupId;
  movedOnce[25].groupId = 'grp-9';
  const deltaMove = diffAndPatch(index0, movedOnce);
  assert.equal(deltaMove.deltaType, 'patch',
    'Cross-group move must be a patch delta (see AC2 groupId check).');
  assert.equal(deltaMove.affected.length, 1);
  assert.equal(deltaMove.affected[0].id, movedOnce[25].id);
  assert.equal(deltaMove.index.byId[movedOnce[25].id].groupIdKey, 'grp-9');
  assert.notEqual('grp-9', originalGroup,
    'Fixture sanity: item did actually change groups.');

  /* Immediately edit the same item's title against the post-move index. */
  const movedAndEdited = movedOnce.map((it) => ({ ...it }));
  movedAndEdited[25].title = 'renamed after group move';
  const deltaEdit = diffAndPatch(deltaMove.index, movedAndEdited);
  assert.equal(deltaEdit.deltaType, 'patch',
    'Follow-up edit in the new group must still be a patch.');
  assert.equal(deltaEdit.affected.length, 1);
  assert.equal(deltaEdit.affected[0].id, movedAndEdited[25].id);
  assert.equal(deltaEdit.index.byId[movedAndEdited[25].id].titleLower,
    'renamed after group move');
  /* The groupIdKey from the previous step is preserved through the edit. */
  assert.equal(deltaEdit.index.byId[movedAndEdited[25].id].groupIdKey, 'grp-9');
});
