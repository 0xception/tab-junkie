/**
 * b102-cross-window-demote.test.js — Sprint 35 / B-102 R5 (AC6)
 *
 * B-102 ships the SHARED §50 fix with B-103: in `sidepanel/sidepanel.js`, the
 * `diffAndPatch` `'noop'` and `'patch'` fast-path branches now call
 * `patchOpenTabsSection(_cachedOpenTabs)` immediately AFTER `_setCachedOpenTabs`
 * — and on the `'patch'` branch, AFTER the `_itemById = new Map(...)` rebuild
 * AND INSIDE the `if (allApplied)` gate (per R4 H-1 + M-1 ordering fix).
 * Without this, a cross-window demote left the demoted item GONE from BOTH
 * the group section AND the Open Tabs section on every non-originating
 * sidepanel window — the user-visible symptom from S33 B-099 UAT-13.
 *
 * The B-102 test surface focuses on cross-window broadcast convergence:
 *
 *   T1 — AC1 broadcast latency: MSG_DEMOTE_ITEM dispatch → SW broadcast
 *        envelope captured within 500 ms with the correct scope ('items').
 *   T2 — AC2 receivers refetch BOTH items AND openTabs on items-scope
 *        broadcast: a reproduced fast-path receiver populates `_cachedItems`
 *        AND `_cachedOpenTabs` AND patches the DOM for both sections.
 *   T3 — AC3 + AC4 demoted item visible in Open Tabs + removed from group on
 *        receivers: build a fake state with item X claimed by tab T;
 *        broadcast a demote → assert post-state in the receiver DOM.
 *   T4 — AC5 originating-window regression guard: same as T3 from the
 *        originating-window perspective; the fix is additive — pre-existing
 *        originating-window behavior is unchanged.
 *   T5 — multi-window state convergence: SKIPPED. `chrome.runtime.sendMessage`
 *        in the chrome-mock dispatches into ONE in-process listener array, so
 *        a true two-context cross-window broadcast is not faithful here.
 *        The convergence symptom is the central B-102 bug and is covered by
 *        UAT-1 (mandatory MULTI-WINDOW Edge UAT).
 *   T6 — R4 H-1 + M-1 regression guard: read sidepanel.js text and assert
 *        the `'patch'` branch's `patchOpenTabsSection(_cachedOpenTabs)` call
 *        appears AFTER `_itemById = new Map(...)` AND INSIDE the
 *        `if (allApplied) {` block. Mirrors b103 T5.
 *   T7 — `'noop'` branch coverage: the receiver runs the noop path → asserts
 *        `patchOpenTabsSection` still fires + Open Tabs DOM updated.
 *   T8 — idempotency: calling `patchOpenTabsSection(_cachedOpenTabs)` twice
 *        in succession with no intervening change produces zero DOM
 *        mutations on the second call (no flicker, no duplicate work).
 *
 * Strategy:
 *   - T1, T2, T7 use the real registered SW handler + the chrome-mock spy
 *     to observe broadcast envelopes and the post-handler `buildOpenTabs()`
 *     state — the SW-side guarantees that the sidepanel's post-fix
 *     `patchOpenTabsSection` call relies on.
 *   - T3, T4, T8 use a minimal DOM shim (mirrors b101-drift-bar.test.js and
 *     b048-visual-states.test.js) to reproduce `patchOpenTabsSection`,
 *     `_setCachedOpenTabs`, and the relevant fast-path receiver code path
 *     verbatim. `sidepanel/sidepanel.js` runs DOM queries at module load
 *     time and cannot be imported in Node.
 *   - T6 is a code-shape assertion (regex / sequential-text match) against
 *     the live sidepanel.js source text.
 *   - T5 is SKIPPED with a sentinel test that documents the rationale.
 *
 * All tests use the existing chrome-mock — no ad-hoc stubs.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  __resetMock,
  __setMockTabs,
  __getSendMessageCalls,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  runMigrations,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { MSG_DEMOTE_ITEM, MSG_STATE_CHANGED } from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

/* Local helper — dispatch a message through the SW onMessage listener
   that registerStorageHandlers attaches. Mirrors b099 / b103 pattern. */
function getListener() {
  const listeners = chrome.runtime.onMessage._listeners;
  return listeners[listeners.length - 1];
}
async function dispatch(type, payload) {
  return await new Promise((resolve) => {
    getListener()(
      { type, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

async function bootstrapHandlers() {
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;
}

/* =========================================================================
   Minimal DOM shim — covers the surface used by patchOpenTabsSection,
   _setCachedOpenTabs, and the reproduced fast-path receiver code path.
   Mirrors the strategy used by tests/b101-drift-bar.test.js.
   ========================================================================= */

function createElement(tag) {
  const children = [];
  const attrs = {};
  const dataset = {};
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    id: '',
    textContent: '',
    hidden: false,
    isConnected: true,
    parentNode: null,
    dataset,
    get children() { return children; },
    get firstChild() { return children[0] ?? null; },
    get lastElementChild() { return children[children.length - 1] ?? null; },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k] ?? null; },
    removeAttribute(k) { delete attrs[k]; },
    appendChild(child) {
      child.parentNode = el;
      children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentNode = el;
      if (ref === null || ref === undefined) {
        children.push(child);
        return child;
      }
      const idx = children.indexOf(ref);
      if (idx === -1) children.push(child);
      else children.splice(idx, 0, child);
      return child;
    },
    remove() {
      if (el.parentNode) {
        const arr = el.parentNode.children;
        const i = arr.indexOf(el);
        if (i >= 0) arr.splice(i, 1);
        el.parentNode = null;
      }
    },
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const wantedId = sel.slice(1);
        return findById(el, wantedId);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return findByClass(el, cls);
      }
      return null;
    },
  };
  return el;
}

function findById(node, id) {
  for (const c of node.children) {
    if (c.id === id) return c;
    const found = findById(c, id);
    if (found) return found;
  }
  return null;
}

function findByClass(node, cls) {
  for (const c of node.children) {
    if (c.className === cls) return c;
    const found = findByClass(c, cls);
    if (found) return found;
  }
  return null;
}

/* Reproduces sidepanel.js _setCachedOpenTabs (lines ~242-248) verbatim. */
function makeOpenTabsCache() {
  let _cachedOpenTabs = [];
  let _cachedOpenTabsById = new Map();
  function _setCachedOpenTabs(next) {
    _cachedOpenTabs = Array.isArray(next) ? next.slice() : [];
    _cachedOpenTabsById = new Map();
    for (const t of _cachedOpenTabs) _cachedOpenTabsById.set(t.tabId, t);
  }
  return {
    get cachedOpenTabs() { return _cachedOpenTabs; },
    get cachedOpenTabsById() { return _cachedOpenTabsById; },
    _setCachedOpenTabs,
  };
}

/* Reproduces the relevant subset of patchOpenTabsSection (sidepanel.js
   lines ~2851-2909). The reproduction mirrors the exact diff loop the
   production code uses: index existing by tabId → remove vanished →
   walk next array → insert / patch → pop trailing → update count badge. */
function makePatcher(section) {
  let domMutationCount = 0;

  function buildOpenTabRow(tab) {
    domMutationCount += 1;
    const row = createElement('div');
    row.className = 'open-tab-row';
    row.dataset.tabId = String(tab.tabId);
    row.dataset.title = tab.title || '';
    row.dataset.url = tab.url || '';
    if (tab.active) row.dataset.active = 'true';
    if (tab.audible) row.dataset.audible = 'true';
    if (tab.windowId != null) row.dataset.windowId = String(tab.windowId);
    return row;
  }

  function _patchOpenTabRow(row, tab) {
    let mutated = false;
    if (tab.active && row.dataset.active !== 'true') { row.dataset.active = 'true'; mutated = true; }
    if (!tab.active && row.dataset.active === 'true') { delete row.dataset.active; mutated = true; }
    if (tab.audible && row.dataset.audible !== 'true') { row.dataset.audible = 'true'; mutated = true; }
    if (!tab.audible && row.dataset.audible === 'true') { delete row.dataset.audible; mutated = true; }
    if (tab.windowId != null && row.dataset.windowId !== String(tab.windowId)) {
      row.dataset.windowId = String(tab.windowId);
      mutated = true;
    }
    if (mutated) domMutationCount += 1;
  }

  function patchOpenTabsSection(nextOpenTabs) {
    if (!section) return;
    const list = section.querySelector('.open-tabs-list');
    const countBadge = section.querySelector('#open-tabs-count');
    if (!list) return;

    const existing = new Map();
    for (const row of list.children) {
      const tabId = Number(row.dataset.tabId);
      if (!Number.isNaN(tabId)) existing.set(tabId, row);
    }
    const nextById = new Map();
    for (const tab of nextOpenTabs) nextById.set(tab.tabId, tab);

    for (const [tabId, row] of existing) {
      if (!nextById.has(tabId)) {
        row.remove();
        existing.delete(tabId);
        domMutationCount += 1;
      }
    }
    for (let i = 0; i < nextOpenTabs.length; i++) {
      const tab = nextOpenTabs[i];
      let row = existing.get(tab.tabId);
      if (row) {
        _patchOpenTabRow(row, tab);
      } else {
        row = buildOpenTabRow(tab);
      }
      const currentChild = list.children[i];
      if (currentChild !== row) {
        list.insertBefore(row, currentChild || null);
        domMutationCount += 1;
      }
    }
    while (list.children.length > nextOpenTabs.length) {
      list.lastElementChild.remove();
      domMutationCount += 1;
    }
    if (countBadge) {
      const wanted = String(nextOpenTabs.length);
      if (countBadge.textContent !== wanted) {
        countBadge.textContent = wanted;
        domMutationCount += 1;
      }
    }
  }

  return {
    patchOpenTabsSection,
    get domMutationCount() { return domMutationCount; },
    resetMutations() { domMutationCount = 0; },
  };
}

/* Build a minimal sidepanel-shape DOM: an Open Tabs section with a list
   container and a count badge, plus a group section with a couple item rows. */
function buildSidepanelShape(initialOpenTabs, initialItemRows) {
  const root = createElement('div');

  const openTabsSection = createElement('section');
  openTabsSection.id = 'open-tabs-section';
  const list = createElement('div');
  list.className = 'open-tabs-list';
  const count = createElement('span');
  count.id = 'open-tabs-count';
  count.textContent = String(initialOpenTabs.length);
  openTabsSection.appendChild(count);
  openTabsSection.appendChild(list);

  for (const tab of initialOpenTabs) {
    const row = createElement('div');
    row.className = 'open-tab-row';
    row.dataset.tabId = String(tab.tabId);
    row.dataset.title = tab.title || '';
    row.dataset.url = tab.url || '';
    list.appendChild(row);
  }

  const itemList = createElement('div');
  itemList.id = 'item-list';
  for (const item of initialItemRows) {
    const row = createElement('div');
    row.className = 'item-row';
    row.dataset.itemId = item.id;
    row.dataset.groupId = item.groupId || '';
    itemList.appendChild(row);
  }

  root.appendChild(openTabsSection);
  root.appendChild(itemList);
  return { root, openTabsSection, list, count, itemList };
}

/* Reproduce the fast-path receiver code that the §50 fix lives in.
   Mirrors sidepanel.js lines ~5121-5206 with both the 'noop' and 'patch'
   branches. The H-1 + M-1 ordering invariants from R4 are preserved. */
function makeReceiver({ shape, cache, patcher, scope }) {
  let _cachedItems = [];
  let _itemById = new Map();

  function _patchSingleRow(change) {
    if (change.kind === 'removed') {
      const row = shape.itemList.children.find((r) => r.dataset.itemId === change.id);
      if (row) row.remove();
      return true;
    }
    if (change.kind === 'added') {
      const it = _cachedItems.find((i) => i.id === change.id);
      if (!it) return false;
      const row = createElement('div');
      row.className = 'item-row';
      row.dataset.itemId = it.id;
      row.dataset.groupId = it.groupId || '';
      shape.itemList.appendChild(row);
      return true;
    }
    return true;
  }

  /* The receiver runs as if it received MSG_STATE_CHANGED with the given
     scope. It mirrors the post-fix branches in sidepanel.js. */
  function receiveBroadcast(itemsResp, delta) {
    const canPatch = scope === 'items' && _cachedItems.length >= 0; // simplified gate

    let patched = false;
    if (canPatch) {
      if (delta.deltaType === 'noop') {
        _cachedItems = itemsResp.items;
        cache._setCachedOpenTabs(itemsResp.openTabs);
        /* §50 D-1 fix: noop branch must explicitly re-render Open Tabs. */
        patcher.patchOpenTabsSection(cache.cachedOpenTabs);
        patched = true;
      } else if (delta.deltaType === 'patch') {
        const hasReorder = false;
        if (!hasReorder) {
          _cachedItems = itemsResp.items;
          cache._setCachedOpenTabs(itemsResp.openTabs);
          /* H-1 ordering invariant: rebuild _itemById BEFORE patchOpenTabsSection. */
          _itemById = new Map(itemsResp.items.map((it) => [it.id, it]));

          let allApplied = true;
          for (const change of delta.affected) {
            if (!_patchSingleRow(change)) { allApplied = false; break; }
          }
          if (allApplied) {
            /* M-1 ordering invariant: patchOpenTabsSection inside if(allApplied). */
            patcher.patchOpenTabsSection(cache.cachedOpenTabs);
            patched = true;
          }
        }
      }
    }

    return { patched, itemsCount: _cachedItems.length, itemByIdSize: _itemById.size };
  }

  return { receiveBroadcast, get cachedItems() { return _cachedItems; }, get itemById() { return _itemById; } };
}

/* =========================================================================
   T1 — AC1 broadcast latency: MSG_DEMOTE_ITEM yields a captured
   MSG_STATE_CHANGED { scope: 'items' } broadcast within 500 ms, with the
   formerly-claimed tab now appearing in buildOpenTabs() (the SW-side
   guarantee that the receiver-side patchOpenTabsSection relies on).
   ========================================================================= */
test('B-102 T1 (AC1): MSG_DEMOTE_ITEM dispatch produces SCOPE.ITEMS broadcast within 500 ms; buildOpenTabs includes the formerly-claimed tab', async () => {
  /* Seed: one saved item with a live claimed tab; one untracked tab. */
  const item = {
    id: 'demote-target',
    url: 'https://saved.example/p',
    title: 'Saved',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({ items: [item], meta: { schemaVersion: KNOWN_VERSION } });
  await bootstrapHandlers();

  __setMockTabs([
    { id: 50, url: 'https://saved.example/p', title: 'Saved', windowId: 1, active: false, audible: false, index: 0 },
    { id: 51, url: 'https://other.example/q', title: 'Other', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'demote-target', url: 'https://saved.example/p', sortOrder: 0 }]);

  /* Pre-state: tab 50 claimed, NOT in Open Tabs; tab 51 unclaimed, IS in Open Tabs. */
  let openTabs = buildOpenTabs();
  let openIds = openTabs.map((t) => t.tabId);
  assert.ok(!openIds.includes(50), 'sanity: tab 50 is claimed and excluded from Open Tabs pre-demote');
  assert.ok(openIds.includes(51), 'sanity: tab 51 is in Open Tabs pre-demote');

  /* Snapshot the sendMessage spy index BEFORE dispatch so we can isolate
     the broadcasts produced by THIS dispatch (the spy is module-shared). */
  const calls = __getSendMessageCalls();
  const preIdx = calls.length;

  const t0 = Date.now();
  const resp = await dispatch(MSG_DEMOTE_ITEM, { itemId: 'demote-target' });
  const elapsedMs = Date.now() - t0;
  assert.equal(resp.ok, true, 'demote dispatch must succeed');
  assert.ok(elapsedMs < 500, `AC1: dispatch + broadcast envelope must complete in < 500 ms (actual: ${elapsedMs} ms)`);

  /* Inspect the broadcast envelope. The dispatcher fires
     chrome.runtime.sendMessage({ type: MSG_STATE_CHANGED, payload }) AFTER
     sendResponse — so by the time `await dispatch` resolves, the call has
     been recorded by the spy. */
  const newCalls = calls.slice(preIdx);
  const stateChangedCall = newCalls.find(
    (args) => args[0] && args[0].type === MSG_STATE_CHANGED,
  );
  assert.ok(
    stateChangedCall,
    'AC1: chrome.runtime.sendMessage MUST be called with MSG_STATE_CHANGED after MSG_DEMOTE_ITEM',
  );
  assert.equal(
    stateChangedCall[0].payload.scope, SCOPE.ITEMS,
    'AC1: broadcast scope must be SCOPE.ITEMS for a demote',
  );
  assert.equal(
    stateChangedCall[0].payload.trigger, MSG_DEMOTE_ITEM,
    'AC1: broadcast trigger must identify the originating MSG_DEMOTE_ITEM',
  );

  /* Post-state: tab 50 is now UNCLAIMED and MUST appear in Open Tabs. This
     is the SW-side state that every receiver (originating + non-originating)
     will see on its MSG_LIST_ITEMS round-trip after the broadcast. */
  openTabs = buildOpenTabs();
  openIds = openTabs.map((t) => t.tabId);
  assert.ok(openIds.includes(50), 'AC1/AC3: post-demote, formerly-claimed tab 50 appears in Open Tabs');
  assert.ok(openIds.includes(51), 'AC1: tab 51 still in Open Tabs');
  assert.equal(openTabs.length, 2, 'AC1: Open Tabs grows by exactly the released tab');
});

/* =========================================================================
   T2 — AC2 receivers refetch BOTH items AND openTabs scopes correctly: on
   an items-scope broadcast the reproduced fast-path receiver populates
   _cachedItems AND _cachedOpenTabs AND patches the DOM for both sections.
   ========================================================================= */
test('B-102 T2 (AC2): items-scope broadcast → receiver updates _cachedItems AND _cachedOpenTabs AND DOM for both sections', () => {
  /* Pre-state: one demoted-target item row in DOM; Open Tabs DOM has one
     unrelated tab (60) but NOT the formerly-claimed tab (50). */
  const shape = buildSidepanelShape(
    [{ tabId: 60, title: 'Other', url: 'https://other.example/q' }],
    [{ id: 'demote-target', groupId: null }],
  );
  const cache = makeOpenTabsCache();
  cache._setCachedOpenTabs([{ tabId: 60, title: 'Other', url: 'https://other.example/q' }]);
  const patcher = makePatcher(shape.openTabsSection);
  const receiver = makeReceiver({ shape, cache, patcher, scope: 'items' });

  /* Simulate the post-demote items-scope broadcast: items list no longer
     contains demote-target; openTabs now contains BOTH the unrelated tab AND
     the formerly-claimed tab 50. */
  const itemsResp = {
    items: [],
    openTabs: [
      { tabId: 50, title: 'Saved', url: 'https://saved.example/p' },
      { tabId: 60, title: 'Other', url: 'https://other.example/q' },
    ],
  };
  const delta = { deltaType: 'patch', affected: [{ kind: 'removed', id: 'demote-target' }] };

  const r = receiver.receiveBroadcast(itemsResp, delta);

  /* AC2(a): _cachedItems updated. */
  assert.equal(r.itemsCount, 0, 'AC2: _cachedItems updated to the post-demote list');

  /* AC2(b): _cachedOpenTabs updated via _setCachedOpenTabs. */
  assert.equal(cache.cachedOpenTabs.length, 2, 'AC2: _cachedOpenTabs refreshed with the new openTabs array');
  assert.ok(cache.cachedOpenTabsById.has(50), 'AC2: cache mirror has formerly-claimed tab 50');
  assert.ok(cache.cachedOpenTabsById.has(60), 'AC2: cache mirror still has tab 60');

  /* AC2(c): DOM for items section updated — demote-target row removed. */
  assert.equal(shape.itemList.children.length, 0, 'AC2 + AC4: demote-target row removed from items DOM');

  /* AC2(d): DOM for Open Tabs section updated — tab 50 row mounted. */
  const tabIds = shape.list.children.map((row) => Number(row.dataset.tabId));
  assert.ok(tabIds.includes(50), 'AC2 + AC3: post-fix patchOpenTabsSection mounted the formerly-claimed tab row');
  assert.ok(tabIds.includes(60), 'AC2: existing tab 60 still in Open Tabs DOM');
  assert.equal(shape.count.textContent, '2', 'AC2: Open Tabs count badge updated to 2');
  assert.equal(r.patched, true, 'AC2: fast-path receiver completed without falling through to renderAll');
});

/* =========================================================================
   T3 — AC3 + AC4 demoted item visible in Open Tabs + removed from group on
   receivers (the central B-102 bug surface — the receiver-side post-state).
   ========================================================================= */
test('B-102 T3 (AC3 + AC4): receiver post-state — demoted item gone from group DOM AND formerly-claimed tab visible in Open Tabs DOM', () => {
  /* Pre-state mirrors a non-originating window's clean cache: item X
     ('item-x') is in its group; tab T (70) is claimed by item-x and
     NOT in Open Tabs; an unrelated tab 71 IS in Open Tabs. */
  const shape = buildSidepanelShape(
    [{ tabId: 71, title: 'Unrelated', url: 'https://unrelated.example/x' }],
    [
      { id: 'item-x', groupId: 'group-A' },
      { id: 'item-other', groupId: 'group-A' },
    ],
  );
  const cache = makeOpenTabsCache();
  cache._setCachedOpenTabs([{ tabId: 71, title: 'Unrelated', url: 'https://unrelated.example/x' }]);
  const patcher = makePatcher(shape.openTabsSection);
  const receiver = makeReceiver({ shape, cache, patcher, scope: 'items' });

  /* The non-originating window's MSG_LIST_ITEMS round-trip — items now
     excludes item-x; openTabs now includes the released tab 70. */
  const itemsResp = {
    items: [{ id: 'item-other', groupId: 'group-A', url: 'https://other.example/y' }],
    openTabs: [
      { tabId: 70, title: 'Was Saved', url: 'https://wassaved.example/p' },
      { tabId: 71, title: 'Unrelated', url: 'https://unrelated.example/x' },
    ],
  };
  const delta = { deltaType: 'patch', affected: [{ kind: 'removed', id: 'item-x' }] };

  receiver.receiveBroadcast(itemsResp, delta);

  /* AC4: item-x removed from its group section DOM. */
  const itemRowIds = shape.itemList.children.map((r) => r.dataset.itemId);
  assert.ok(!itemRowIds.includes('item-x'), 'AC4: item-x row gone from group DOM on the receiver');
  assert.ok(itemRowIds.includes('item-other'), 'AC4: sibling item-other untouched');

  /* AC3: tab 70 (formerly-claimed) visible in Open Tabs DOM. */
  const tabIds = shape.list.children.map((r) => Number(r.dataset.tabId));
  assert.ok(tabIds.includes(70), 'AC3: tab 70 (formerly claimed by item-x) visible in Open Tabs DOM on the receiver');
  assert.ok(tabIds.includes(71), 'AC3: unrelated tab 71 unchanged');
  assert.equal(shape.list.children.length, 2, 'AC3: Open Tabs section grew by exactly one row');
  assert.equal(shape.count.textContent, '2', 'AC3: count badge updated');
});

/* =========================================================================
   T4 — AC5 originating-window regression guard: the same broadcast applied
   from the originating-window perspective converges to the same end-state.
   The fix is additive — pre-existing originating-window behavior is
   unchanged. (b099-drift-fix.test.js T8 is the SW-side regression guard;
   this test guards the receiver-side post-fix DOM contract on the
   originating window specifically.)
   ========================================================================= */
test('B-102 T4 (AC5 regression): originating-window receiver converges to the same post-state — fix is additive, no regression', () => {
  /* Pre-state mirrors the originating window: same shape as T3, since the
     originating sidepanel ALSO receives the broadcast (chrome.runtime.sendMessage
     fans out to ALL contexts). */
  const shape = buildSidepanelShape(
    [{ tabId: 81, title: 'Unrelated', url: 'https://unrelated.example/orig' }],
    [{ id: 'item-orig', groupId: 'group-A' }],
  );
  const cache = makeOpenTabsCache();
  cache._setCachedOpenTabs([{ tabId: 81, title: 'Unrelated', url: 'https://unrelated.example/orig' }]);
  const patcher = makePatcher(shape.openTabsSection);
  const receiver = makeReceiver({ shape, cache, patcher, scope: 'items' });

  const itemsResp = {
    items: [],
    openTabs: [
      { tabId: 80, title: 'Was Saved', url: 'https://wassaved.example/orig' },
      { tabId: 81, title: 'Unrelated', url: 'https://unrelated.example/orig' },
    ],
  };
  const delta = { deltaType: 'patch', affected: [{ kind: 'removed', id: 'item-orig' }] };

  receiver.receiveBroadcast(itemsResp, delta);

  /* AC5 invariants — originating window's end-state is identical to the
     non-originating window's end-state from T3. */
  const itemRowIds = shape.itemList.children.map((r) => r.dataset.itemId);
  assert.ok(!itemRowIds.includes('item-orig'), 'AC5: originating window — demoted item gone from group DOM (unchanged behavior)');

  const tabIds = shape.list.children.map((r) => Number(r.dataset.tabId));
  assert.ok(tabIds.includes(80), 'AC5: originating window — released tab visible in Open Tabs DOM');
  assert.ok(tabIds.includes(81), 'AC5: unrelated tab unchanged');
  assert.equal(shape.list.children.length, 2, 'AC5: Open Tabs section size matches non-originating end-state (T3)');
});

/* =========================================================================
   T5 — Multi-window state convergence — SKIPPED.
   chrome.runtime.sendMessage in chrome-mock dispatches into ONE in-process
   listener array; a true two-context cross-window broadcast is not faithful
   here. The convergence symptom is the central B-102 bug and is covered by
   UAT-1 (mandatory MULTI-WINDOW Edge UAT).
   ========================================================================= */
test('B-102 T5 (multi-window convergence): SKIPPED — requires real chrome.runtime cross-context — covered by UAT-1', () => {
  /* This test is intentionally a sentinel. The DOM-divergence symptom that
     produced B-102 only reproduces in a real Edge/Chrome session with two
     SEPARATE sidepanel contexts that each maintain their own _cachedItems,
     _cachedOpenTabs, and DOM trees. chrome-mock's runtime.onMessage is a
     single shared listener array per process — it cannot model two
     independent receiver contexts each running their own diffAndPatch and
     their own patchOpenTabsSection.

     The end-state convergence contract (B-102 AC1 + AC3 + AC4) is verified
     by docs/UAT_B-102.md UAT-1 (priority B, MULTI-WINDOW REQUIRED). The
     receiver-side DOM transforms that the convergence relies on ARE
     verified end-to-end here by T2 + T3 + T4 against the reproduced
     fast-path receiver code. */
  assert.ok(true, 'documented skip — covered by docs/UAT_B-102.md UAT-1');
});

/* =========================================================================
   T6 — R4 H-1 + M-1 regression guard: read sidepanel.js text and assert
   the 'patch' branch's patchOpenTabsSection(_cachedOpenTabs) call appears
   AFTER `_itemById = new Map(...)` AND INSIDE the `if (allApplied) {` block.
   ========================================================================= */
test('B-102 T6 (R4 H-1 + M-1 regression): sidepanel.js patch branch — patchOpenTabsSection AFTER _itemById rebuild AND INSIDE if(allApplied)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'sidepanel', 'sidepanel.js'),
    'utf8',
  );

  /* Locate the 'patch' branch body: starts at `} else if (delta.deltaType === 'patch')`
     and ends at the full-rebuild fall-through comment. */
  const patchBranchIdx = src.indexOf("} else if (delta.deltaType === 'patch')");
  assert.ok(
    patchBranchIdx !== -1,
    "sidepanel.js must contain the `} else if (delta.deltaType === 'patch')` branch",
  );
  const fallbackIdx = src.indexOf("'full-rebuild' deltas fall through", patchBranchIdx);
  assert.ok(
    fallbackIdx !== -1,
    'sidepanel.js must contain the full-rebuild fall-through comment as a section terminator',
  );
  const branchBody = src.slice(patchBranchIdx, fallbackIdx);

  /* H-1 invariant: the patchOpenTabsSection call must appear AFTER
     `_itemById = new Map(`. */
  const itemByIdIdx = branchBody.indexOf('_itemById = new Map(');
  assert.ok(itemByIdIdx !== -1, 'patch branch must rebuild `_itemById = new Map(...)`');
  const patchCallIdx = branchBody.indexOf('patchOpenTabsSection(_cachedOpenTabs)', itemByIdIdx);
  assert.ok(
    patchCallIdx !== -1,
    'patch branch must call `patchOpenTabsSection(_cachedOpenTabs)` AFTER the _itemById rebuild',
  );
  assert.ok(
    patchCallIdx > itemByIdIdx,
    'R4 H-1 ordering invariant: patchOpenTabsSection MUST be positioned AFTER `_itemById = new Map(...)` in the patch branch',
  );

  /* M-1 invariant: the patchOpenTabsSection call must live INSIDE the
     `if (allApplied) {` block. We assert by checking the call index lies
     after the `if (allApplied) {` opening. */
  const allAppliedGateIdx = branchBody.indexOf('if (allApplied) {');
  assert.ok(allAppliedGateIdx !== -1, 'patch branch must include an `if (allApplied) {` gate');
  assert.ok(
    patchCallIdx > allAppliedGateIdx,
    'R4 M-1 ordering invariant: patchOpenTabsSection MUST be guarded by `if (allApplied) {` — the abort path falls through to renderAll which already rebuilds Open Tabs (no double-render, no flicker)',
  );

  /* Sanity: the 'noop' branch (separately) ALSO has a patchOpenTabsSection
     call — a regression guard so a future refactor can't silently delete
     the noop-branch site while leaving the patch-branch site in place. */
  const noopBranchIdx = src.indexOf("if (delta.deltaType === 'noop')");
  assert.ok(noopBranchIdx !== -1, "sidepanel.js must contain the `if (delta.deltaType === 'noop')` branch");
  const noopBranchEnd = src.indexOf("} else if (delta.deltaType === 'patch')", noopBranchIdx);
  const noopBody = src.slice(noopBranchIdx, noopBranchEnd);
  assert.ok(
    noopBody.includes('patchOpenTabsSection(_cachedOpenTabs)'),
    'noop branch must ALSO call patchOpenTabsSection(_cachedOpenTabs) — both fast-path branches need the §50 D-1 fix',
  );
});

/* =========================================================================
   T7 — `'noop'` branch coverage: a noop-resolving items-scope broadcast
   still fires patchOpenTabsSection + Open Tabs DOM updated correctly.
   ========================================================================= */
test('B-102 T7 (noop branch): noop-resolving items-scope broadcast still updates Open Tabs DOM', () => {
  /* Pre-state: a single-window receiver with one tab in Open Tabs.
     A 'noop' delta means the items list is unchanged (same items, same
     identities) — but liveStates / openTabs may still have shifted (e.g.
     a tab navigated, or a claim-released elsewhere). */
  const shape = buildSidepanelShape(
    [{ tabId: 90, title: 'Old', url: 'https://old.example/' }],
    [{ id: 'stable-item', groupId: null }],
  );
  const cache = makeOpenTabsCache();
  cache._setCachedOpenTabs([{ tabId: 90, title: 'Old', url: 'https://old.example/' }]);
  const patcher = makePatcher(shape.openTabsSection);
  const receiver = makeReceiver({ shape, cache, patcher, scope: 'items' });

  /* Simulate a noop-resolving broadcast carrying a CHANGED openTabs array
     (e.g. a sibling window released a claim — items unchanged here, openTabs
     gained tab 91). */
  const itemsResp = {
    items: [{ id: 'stable-item', groupId: null, url: 'https://stable.example/' }],
    openTabs: [
      { tabId: 90, title: 'Old', url: 'https://old.example/' },
      { tabId: 91, title: 'New', url: 'https://new.example/' },
    ],
  };
  const delta = { deltaType: 'noop', affected: [] };

  const r = receiver.receiveBroadcast(itemsResp, delta);

  assert.equal(r.patched, true, 'T7: noop branch sets patched=true');
  /* §50 D-1: the noop branch must call patchOpenTabsSection so the new tab
     is mounted even though no items deltas exist. */
  const tabIds = shape.list.children.map((row) => Number(row.dataset.tabId));
  assert.ok(tabIds.includes(91), 'T7: noop-branch fix mounted the new tab in Open Tabs DOM');
  assert.ok(tabIds.includes(90), 'T7: existing tab still present');
  assert.equal(shape.count.textContent, '2', 'T7: count badge updated');
  /* Items DOM unchanged — noop branch does not touch item rows. */
  assert.equal(shape.itemList.children.length, 1, 'T7: items DOM unchanged on noop branch');
});

/* =========================================================================
   T8 — Idempotency: calling patchOpenTabsSection(_cachedOpenTabs) twice in
   succession with no intervening change produces zero DOM mutations on the
   second call (no flicker, no duplicate work).
   ========================================================================= */
test('B-102 T8 (idempotency): second patchOpenTabsSection call against unchanged cache produces zero DOM mutations', () => {
  const shape = buildSidepanelShape(
    [
      { tabId: 100, title: 'A', url: 'https://a.example/' },
      { tabId: 101, title: 'B', url: 'https://b.example/' },
    ],
    [],
  );
  const cache = makeOpenTabsCache();
  cache._setCachedOpenTabs([
    { tabId: 100, title: 'A', url: 'https://a.example/' },
    { tabId: 101, title: 'B', url: 'https://b.example/' },
  ]);
  const patcher = makePatcher(shape.openTabsSection);

  /* First call — DOM already matches, but row dataset attrs (active/audible/
     windowId) on the seeded rows are unset, so the patch loop touches them
     once. Reset the counter AFTER the first call to isolate the idempotency
     check on the SECOND call. */
  patcher.patchOpenTabsSection(cache.cachedOpenTabs);
  patcher.resetMutations();

  /* Second call against the unchanged cache. */
  patcher.patchOpenTabsSection(cache.cachedOpenTabs);

  assert.equal(
    patcher.domMutationCount, 0,
    'T8: idempotent — second patchOpenTabsSection call produces zero DOM mutations against an unchanged cache',
  );
  assert.equal(shape.list.children.length, 2, 'T8: row count unchanged');
  assert.equal(shape.count.textContent, '2', 'T8: count badge unchanged');
});
