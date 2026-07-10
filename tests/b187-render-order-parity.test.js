/**
 * b187-render-order-parity.test.js — B-187 (parity net) + B-188 (RP-B fix)
 *
 * Display-order consolidation Tier-A. Authoritative spec:
 * docs/design/77-display-order-consolidation-r0-spike.md (§77).
 *
 * "What order do rows appear in" is governed by Group.renderOrder — the
 * authority the FULL render path respects via resolveRenderOrder
 * (sidepanel.js:2434 / newtab.js:991). Two INCREMENTAL paths historically
 * ignored it:
 *   - RP-B patchFloatingMembersSections (sidepanel.js:3225) inserted NEW
 *     floating rows at the bottom `staticAnchor` instead of their renderOrder
 *     slot — the B-184 "floating tab lands at bottom" bug.
 *   - RP-C patchOpenTabsSection (sidepanel.js:3481) — the B-186 "activation
 *     jumps the row up 2-3 spots" report.
 *
 * This net asserts the incremental paths produce the SAME row order as the
 * full render for the same inputs, with the two bug cases as named coverage:
 *
 *   FLOATING (RP-B, the real reproducible bug — RED before B-188):
 *     A NEW floating member appearing via the incremental path lands at its
 *     renderOrder slot, not the bottom — matching resolveRenderOrder.
 *
 *   OPEN TABS (RP-C, B-186 — root-caused as NOT a patch-path reorder):
 *     Activating an Open Tab does NOT change buildOpenTabs' (windowId,
 *     tabIndex) order, so the order-faithful patch path cannot move the row.
 *     See the §B-186 ROOT CAUSE block below — the report's "patch re-sorts the
 *     active row" hypothesis is disproven empirically here; these are GREEN
 *     regression guards, not a fixed reorder.
 *
 * The pure insert-index decision behind the RP-B fix lives in
 * shared/render-order.js (resolveInsertBeforeRef) so it can be unit-tested
 * directly and shared with the sidepanel (mirrors the resolveRenderOrder /
 * b148-render-order-resolver pattern — sidepanel.js cannot be imported in
 * Node because of its load-time DOM queries, so the DOM glue is guarded by
 * source-text pins). Plus regression guards for cases that already work, so
 * the net also covers B-189/B-190's later refactors.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { resolveRenderOrder, resolveInsertBeforeRef } from '../shared/render-order.js';

import {
  __resetMock,
  __setMockTabs,
  __setMockWindows,
} from './chrome-mock.js';
import {
  __resetLiveTabIndex,
  buildLiveTabIndex,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  reconcileClaims,
} from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/* =========================================================================
   Fixtures + simulators
   -------------------------------------------------------------------------
   The FULL render path renders one row per ref produced by resolveRenderOrder
   (buildGroupSection, sidepanel.js:2434). The INCREMENTAL floating path
   (patchFloatingMembersSections) keeps existing rows in place and inserts
   NEW floating rows. We model the group-items container as an ordered array
   of refs and reproduce the incremental insertion using the SAME pure
   decision the sidepanel uses (resolveInsertBeforeRef) so the simulation
   tracks the production code, not a divergent copy.
   ========================================================================= */

function group(extra = {}) {
  return Object.assign({
    id: 'g1', name: 'G', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}
function item(id, sortOrder) {
  return { id, title: 'T' + id, url: 'https://x.example/' + id, groupId: 'g1', sortOrder, createdAt: 1, updatedAt: 1 };
}
function floating(floatingTabId, sortOrder) {
  return { floatingTabId, tabId: 1000 + sortOrder, sortOrder, parentItemId: 'item:P' };
}

/** Full render row order = resolveRenderOrder's ref sequence. */
function fullRenderOrder(g, items, floatingMembers) {
  return resolveRenderOrder(g, items, floatingMembers).map((r) => r.ref);
}

/** Seed the existing container: the rows the prior full render already placed,
 *  in renderOrder order, EXCLUDING the floating refs that are arriving new. */
function seedExistingContainer(renderOrder, newFloatingRefs) {
  const incoming = new Set(newFloatingRefs);
  return renderOrder.filter((ref) => !incoming.has(ref));
}

/** NEW behavior (B-188 RP-B fix): insert each new floating ref at its
 *  renderOrder slot via resolveInsertBeforeRef — exactly as the patched
 *  patchFloatingMembersSections computes the anchor. Existing rows untouched. */
function simulateIncrementalInsert(renderOrder, container, newFloatingRefs) {
  const out = container.slice();
  for (const newRef of newFloatingRefs) {
    const present = new Set(out);
    const beforeRef = resolveInsertBeforeRef(renderOrder, newRef, present);
    if (beforeRef == null) {
      out.push(newRef); /* fallback: append at staticAnchor (bottom of zone) */
    } else {
      out.splice(out.indexOf(beforeRef), 0, newRef);
    }
  }
  return out;
}

/** OLD behavior (pre-B-188): NEW floating rows ALWAYS appended at the bottom
 *  staticAnchor regardless of renderOrder — the B-184 defect. Kept here only
 *  to prove the parity assertions actually catch the bug. */
function simulateOldStaticAnchorInsert(container, newFloatingRefs) {
  return container.concat(newFloatingRefs);
}

/* =========================================================================
   resolveInsertBeforeRef — pure unit coverage
   ========================================================================= */

test('B-187 ins-1: returns the first present renderOrder successor of newRef', () => {
  const ro = ['item:P', 'floating:Fnew', 'item:Q'];
  const present = new Set(['item:P', 'item:Q']);
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Fnew', present), 'item:Q');
});

test('B-187 ins-2: skips successors that are NOT present, returns the next present one', () => {
  const ro = ['item:P', 'floating:Fnew', 'floating:Gone', 'item:Q'];
  const present = new Set(['item:P', 'item:Q']); /* floating:Gone absent */
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Fnew', present), 'item:Q');
});

test('B-187 ins-3: newRef is the last ref → null (append at static anchor)', () => {
  const ro = ['item:P', 'item:Q', 'floating:Fnew'];
  const present = new Set(['item:P', 'item:Q']);
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Fnew', present), null);
});

test('B-187 ins-4: no later ref is present → null (append)', () => {
  const ro = ['item:P', 'floating:Fnew', 'item:Q'];
  const present = new Set(['item:P']); /* Q not yet rendered */
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Fnew', present), null);
});

test('B-187 ins-5: newRef absent from renderOrder → null (fallback to static anchor)', () => {
  const ro = ['item:P', 'item:Q'];
  const present = new Set(['item:P', 'item:Q']);
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Unknown', present), null);
});

test('B-187 ins-6: empty / missing renderOrder → null (bootstrap path owns order)', () => {
  assert.equal(resolveInsertBeforeRef([], 'floating:F', new Set()), null);
  assert.equal(resolveInsertBeforeRef(null, 'floating:F', new Set()), null);
  assert.equal(resolveInsertBeforeRef(undefined, 'floating:F', new Set()), null);
});

test('B-187 ins-7: accepts a Map (ref→node) as the membership oracle', () => {
  /* The sidepanel passes a Map<ref, DOMNode>; Map.has(key) satisfies the
     contract identically to a Set. */
  const ro = ['item:P', 'floating:Fnew', 'item:Q'];
  const present = new Map([['item:P', {}], ['item:Q', {}]]);
  assert.equal(resolveInsertBeforeRef(ro, 'floating:Fnew', present), 'item:Q');
});

/* =========================================================================
   FLOATING PARITY (RP-A full vs RP-B incremental)
   ========================================================================= */

test('B-187 float-PARITY-1 (B-184 bug case): a NEW floating member lands at its renderOrder slot, matching the full render', () => {
  /* A tab opened from saved item P (the opener) is anchored DIRECTLY UNDER P
     in renderOrder — the B-148 anchor-under-opener behavior. The new floating
     row arrives via the incremental path while P + Q are already rendered. */
  const items = [item('P', 0), item('Q', 1)];
  const fm = [floating('Fnew', 0)];
  const g = group({ renderOrder: ['item:P', 'floating:Fnew', 'item:Q'] });

  const full = fullRenderOrder(g, items, fm);
  assert.deepEqual(full, ['item:P', 'floating:Fnew', 'item:Q']);

  const container = seedExistingContainer(g.renderOrder, ['floating:Fnew']);
  assert.deepEqual(container, ['item:P', 'item:Q'], 'existing rows are P then Q');

  /* NEW behavior (fix): incremental order === full render order. */
  const incremental = simulateIncrementalInsert(g.renderOrder, container, ['floating:Fnew']);
  assert.deepEqual(incremental, full,
    'incremental floating insert must land at the renderOrder slot (under the opener), not the bottom');

  /* RED reference: the OLD staticAnchor behavior put it at the BOTTOM,
     diverging from the full render — the exact B-184 defect this closes. */
  const old = simulateOldStaticAnchorInsert(container, ['floating:Fnew']);
  assert.deepEqual(old, ['item:P', 'item:Q', 'floating:Fnew']);
  assert.notDeepEqual(old, full,
    'sanity: the pre-fix staticAnchor behavior DID diverge from the full render (the bug)');
});

test('B-187 float-PARITY-2 (already works): a new floating member whose slot IS the bottom matches both paths', () => {
  const items = [item('P', 0), item('Q', 1)];
  const fm = [floating('Fnew', 0)];
  const g = group({ renderOrder: ['item:P', 'item:Q', 'floating:Fnew'] });

  const full = fullRenderOrder(g, items, fm);
  const container = seedExistingContainer(g.renderOrder, ['floating:Fnew']);
  const incremental = simulateIncrementalInsert(g.renderOrder, container, ['floating:Fnew']);

  assert.deepEqual(incremental, full);
  /* When the slot genuinely IS the bottom, old + new agree — the regression
     guard that the fix did not move correctly-bottomed rows. */
  assert.deepEqual(simulateOldStaticAnchorInsert(container, ['floating:Fnew']), full);
});

test('B-187 float-PARITY-3: multiple NEW floating members interleave to the full render order regardless of arrival order', () => {
  const items = [item('P', 0), item('Q', 1)];
  const fm = [floating('F1', 0), floating('F2', 1)];
  const g = group({ renderOrder: ['item:P', 'floating:F1', 'item:Q', 'floating:F2'] });

  const full = fullRenderOrder(g, items, fm);
  assert.deepEqual(full, ['item:P', 'floating:F1', 'item:Q', 'floating:F2']);

  const container = seedExistingContainer(g.renderOrder, ['floating:F1', 'floating:F2']);

  /* Arrival order A: members[] = [F1, F2]. */
  assert.deepEqual(
    simulateIncrementalInsert(g.renderOrder, container, ['floating:F1', 'floating:F2']),
    full,
  );
  /* Arrival order B: reversed members[] = [F2, F1] — must still converge. */
  assert.deepEqual(
    simulateIncrementalInsert(g.renderOrder, container, ['floating:F2', 'floating:F1']),
    full,
    'first-present-successor rule converges to renderOrder for any processing order',
  );
});

test('B-187 float-PARITY-4 (B-148 §3.7 invariant): inserting a new floating row does NOT reposition an EXISTING floating row', () => {
  const items = [item('P', 0), item('Q', 1)];
  const fm = [floating('Fexisting', 0), floating('Fnew', 1)];
  const g = group({ renderOrder: ['item:P', 'floating:Fexisting', 'floating:Fnew', 'item:Q'] });

  const full = fullRenderOrder(g, items, fm);
  /* Fexisting is already placed (prior render); only Fnew arrives. */
  const container = seedExistingContainer(g.renderOrder, ['floating:Fnew']);
  assert.deepEqual(container, ['item:P', 'floating:Fexisting', 'item:Q']);

  const incremental = simulateIncrementalInsert(g.renderOrder, container, ['floating:Fnew']);
  assert.deepEqual(incremental, full);
  /* Fexisting kept its index-1 slot — never re-anchored. */
  assert.equal(incremental.indexOf('floating:Fexisting'), 1);
});

test('B-187 float-PARITY-5 (bootstrap): no renderOrder → incremental falls back to append, matching the bootstrap full render (saved-then-floating)', () => {
  const items = [item('P', 0), item('Q', 1)];
  const fm = [floating('Fnew', 0)];
  const g = group({ /* no renderOrder */ });

  const full = fullRenderOrder(g, items, fm);
  assert.deepEqual(full, ['item:P', 'item:Q', 'floating:Fnew'],
    'bootstrap = saved (sortOrder) then floating (sortOrder)');

  /* With no renderOrder the helper returns null → append at staticAnchor,
     which equals the bootstrap full render. */
  const container = ['item:P', 'item:Q'];
  const incremental = simulateIncrementalInsert(g.renderOrder, container, ['floating:Fnew']);
  assert.deepEqual(incremental, full);
});

/* =========================================================================
   OPEN-TAB PARITY + §B-186 ROOT CAUSE (RP-C)
   -------------------------------------------------------------------------
   §B-186 ROOT CAUSE (empirically established here):
   patchOpenTabsSection is ORDER-FAITHFUL — it forces the DOM to match its
   input array (buildOpenTabs output, sorted by (windowId, tabIndex)). It
   cannot produce a different order than its input. chrome.tabs.onActivated
   (tab-events.js:319) only flips `active`; it preserves `index`
   (live-tab-index.js updateTabEntry → Object.assign). Therefore activating a
   tab does NOT change buildOpenTabs' order → the patch path cannot move the
   row. The B-186 "patch re-sorts the active row" hypothesis is disproven; the
   only mock-reproducible reorder is an UPSTREAM live-index race (activating a
   tabId not yet indexed fabricates index:0), which is a different layer and a
   top-jump, not the reported mid-list jump. These are GREEN regression guards
   that lock the order-faithful contract against future regressions.
   ========================================================================= */

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

async function seedOpenTabs(tabs) {
  __setMockWindows([{ id: 1 }]);
  __setMockTabs(tabs);
  await buildLiveTabIndex();
  await reconcileClaims([]); /* no claims → all tabs are "open" */
}

test('B-187 open-PARITY-1 (B-186 acceptance): activating a mid-list Open Tab does NOT change buildOpenTabs order', async () => {
  await seedOpenTabs([
    { id: 10, url: 'https://a.example', windowId: 1, active: true, audible: false, index: 0 },
    { id: 11, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
    { id: 13, url: 'https://d.example', windowId: 1, active: false, audible: false, index: 3 },
    { id: 14, url: 'https://e.example', windowId: 1, active: false, audible: false, index: 4 },
    { id: 15, url: 'https://f.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  registerTabEventListeners(Promise.resolve());

  const before = buildOpenTabs().map((t) => t.tabId);
  assert.deepEqual(before, [10, 11, 12, 13, 14, 15]);

  /* Activate a mid-list tab — the B-186 scenario. */
  chrome.tabs.onActivated.__fire({ tabId: 14, windowId: 1 });

  const after = buildOpenTabs().map((t) => t.tabId);
  assert.deepEqual(after, before,
    'activation flips `active` only; (windowId, tabIndex) order is invariant → no row jump');

  /* The activated tab kept its index — the load-bearing fact. */
  assert.equal(getLiveTabIndex().get(14).index, 4);
  assert.equal(getLiveTabIndex().get(14).active, true);
});

test('B-187 open-PARITY-2: buildOpenTabs orders strictly by (windowId, tabIndex), independent of `active`', async () => {
  await seedOpenTabs([
    { id: 20, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 2 },
    { id: 21, url: 'https://b.example', windowId: 1, active: true, audible: false, index: 0 },
    { id: 22, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  /* Active tab (21) is NOT hoisted — it sorts by its index (0). */
  assert.deepEqual(buildOpenTabs().map((t) => t.tabId), [21, 22, 20]);
});

test('B-187 open-PARITY-3 (full vs incremental input parity): both render paths consume the SAME (windowId, tabIndex)-sorted array', () => {
  /* The full path (buildTopLevelSection tail) appends rows in array order; the
     incremental path (patchOpenTabsSection) reconciles the DOM to the SAME
     array index order (sidepanel.js:3508-3521). Both consume buildOpenTabs'
     output verbatim, so for identical input they cannot disagree. We pin the
     shape of the patch loop here (it inserts by array index, with NO
     active-based secondary ordering) since sidepanel.js can't be imported. */
  const src = readFile('sidepanel/sidepanel.js');
  const fn = src.slice(src.indexOf('function patchOpenTabsSection'),
    src.indexOf('function _patchOpenTabRow'));
  assert.match(fn, /for \(let i = 0; i < nextOpenTabs\.length; i\+\+\)/,
    'patch loop walks the sorted array by index');
  assert.match(fn, /list\.children\[i\]/,
    'patch inserts at the sorted-position index (no active-based reorder)');
  assert.doesNotMatch(fn, /\.active\b[^)]*sort|sort[^)]*\.active\b/,
    'patch path must NOT re-sort by active state');
});

/* =========================================================================
   Wiring pins — the DOM glue in sidepanel.js (un-importable in Node) actually
   consumes the shared resolver. Mirrors b148 §3.7's import/call pins.
   ========================================================================= */

test('B-187 wiring-1: patchFloatingMembersSections imports + uses resolveInsertBeforeRef for new-row placement', () => {
  const src = readFile('sidepanel/sidepanel.js');
  assert.match(src, /import \{[^}]*resolveInsertBeforeRef[^}]*\} from .*shared\/render-order/,
    'sidepanel imports the shared insert-index resolver');
  /* The renderOrder-respecting anchor is computed for new floating rows. */
  assert.match(src, /resolveInsertBeforeRef\(/,
    'sidepanel calls resolveInsertBeforeRef');
  /* Guard against a regression to "always staticAnchor for new rows": the
     new-row branch must reference the computed anchor, not only staticAnchor. */
  const fn = src.slice(src.indexOf('function patchFloatingMembersSections'),
    src.indexOf('function _deriveTopLevelRenderOrder'));
  assert.match(fn, /_resolveFloatingRowAnchor\(/,
    'new floating rows resolve their renderOrder anchor (not unconditional staticAnchor)');
});
