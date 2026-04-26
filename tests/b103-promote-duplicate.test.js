/**
 * b103-promote-duplicate.test.js — Sprint 35 / B-103 R5 (AC6)
 *
 * B-103 ships the SHARED §50 fix with B-102: in `sidepanel/sidepanel.js`,
 * the `diffAndPatch` `'noop'` and `'patch'` fast-path branches now call
 * `patchOpenTabsSection(_cachedOpenTabs)` immediately AFTER `_setCachedOpenTabs`
 * (and AFTER the `_itemById` rebuild on the `'patch'` branch — per R4 H-1
 * fix). Without this, promoting an open tab into a saved bookmark left BOTH
 * the new bookmark AND the original Open Tabs row visible (the "duplicate"
 * symptom from S33 B-099 UAT-13).
 *
 * The B-103 test surface focuses on POST-PROMOTE single-window state:
 *   - the SW handler's `createItem` → `claimTabForItem` atomicity contract
 *     (T2: read-only AST/text assertion against storage-handlers.js)
 *   - the `claimsMirror` regression (T3: claim is established before the
 *     handler returns)
 *   - `buildOpenTabs()` filter regression (T4: a claimed tab is excluded
 *     from the returned list — this is the SW-side guarantee that makes the
 *     sidepanel-side `patchOpenTabsSection` call effective)
 *   - the `patch` branch ordering invariant — `patchOpenTabsSection` runs
 *     AFTER `_itemById` rebuild (T5: read-only against sidepanel.js to
 *     prove R4 H-1's fix lives at the right line)
 *   - the post-promote DOM contract end-to-end via a synthetic SW dispatch
 *     (T1) and a documented audible-promote follow-up case (T6)
 *
 * NOTE on B-102 overlap: B-102's R5 `tests/b102-cross-window-demote.test.js`
 * exercises the cross-window demote scenario and includes its own equivalent
 * of the patch-branch ordering regression (T6 over there). B-103's tests
 * intentionally focus on the PROMOTE path so the two test files do not
 * duplicate each other's assertions.
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
  __getSessionStore,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  claimTabForItem,
  getClaimsMirror,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  runMigrations,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { listItems, createGroup } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { MSG_PROMOTE_TAB } from '../shared/messages.js';

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
   that registerStorageHandlers attaches. Returns the full envelope. */
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

/* Re-usable "register handlers + run migrations" boilerplate. */
async function bootstrapHandlers() {
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;
}

/* =========================================================================
   T1 — AC1 + AC2 post-promote single-window state (end-to-end SW round-trip)
   Promote an open tab; verify (a) the new bookmark exists in storage in the
   target group, (b) the claim is recorded, and (c) buildOpenTabs() now
   excludes the promoted tabId — i.e. the SW-side state that the post-fix
   sidepanel patchOpenTabsSection call relies on for the DOM repaint.
   ========================================================================= */
test('B-103 T1 (AC1 + AC2): promote dispatch yields claimed bookmark + buildOpenTabs excludes the promoted tab', async () => {
  await bootstrapHandlers();

  const group = await createGroup({ name: 'Work', color: GROUP_COLORS[0], parentId: null });

  __setMockTabs([
    { id: 100, url: 'https://promote-me.example/page', title: 'Promote Me', windowId: 1, active: false, audible: false, index: 0 },
    { id: 101, url: 'https://other.example/keep', title: 'Keep Open', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  /* Reconcile against an empty items list so claimsMirror is initialised
     (isClaimsReady → true). Pre-promote both tabs are in Open Tabs. */
  await reconcileClaims([]);
  const preOpen = buildOpenTabs();
  assert.equal(preOpen.length, 2, 'sanity: both tabs in Open Tabs pre-promote');

  /* Dispatch MSG_PROMOTE_TAB through the real registered handler. */
  const resp = await dispatch(MSG_PROMOTE_TAB, { tabId: 100, groupId: group.id });
  assert.equal(resp.ok, true, 'promote dispatch must succeed');
  const newItem = resp.data;
  assert.ok(newItem && newItem.id, 'response carries a new item with id');
  assert.equal(newItem.groupId, group.id, 'AC1: new item is assigned to the requested group');

  /* (a) Bookmark exists in storage in the target group. */
  const items = await listItems();
  const stored = items.find((it) => it.id === newItem.id);
  assert.ok(stored, 'new bookmark is persisted in tj:items');
  assert.equal(stored.groupId, group.id, 'AC1: stored bookmark is in the target group');

  /* (b) Claim is recorded — both in-memory mirror AND session storage
     (the SW-side handler awaits claimTabForItem before returning). */
  const mirror = getClaimsMirror();
  assert.equal(mirror[newItem.id], 100, 'AC1: claimsMirror records {newItemId: tabId}');
  const session = __getSessionStore('tj:tabClaims');
  assert.equal(session[newItem.id], 100, 'AC1: claim persisted to tj:tabClaims session storage');

  /* (c) buildOpenTabs() now excludes tab 100 — the SW-side guarantee that
     the sidepanel's post-fix patchOpenTabsSection call removes the row
     for. AC2 in spirit: the cache the sidepanel patches with no longer
     contains the promoted tab. */
  const postOpen = buildOpenTabs();
  const postIds = postOpen.map((t) => t.tabId);
  assert.ok(!postIds.includes(100), 'AC2: buildOpenTabs() excludes the promoted tab');
  assert.ok(postIds.includes(101), 'AC2: buildOpenTabs() still includes the unrelated tab');
  assert.equal(postOpen.length, 1, 'Open Tabs list is now shorter by exactly one');
});

/* =========================================================================
   T2 — AC3 SW handler atomicity (read-only AST / text assertion)
   Verify by reading storage-handlers.js text that MSG_PROMOTE_TAB awaits
   createItem AND claimTabForItem BEFORE returning the new item, and that
   the claimTabForItem call appears AFTER the createItem await. This is a
   regression guard for the §51.D-2 atomicity invariant.
   ========================================================================= */
test('B-103 T2 (AC3): MSG_PROMOTE_TAB handler awaits createItem then claimTabForItem before return (atomicity invariant)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'background', 'messages', 'storage-handlers.js'),
    'utf8',
  );

  /* Locate the MSG_PROMOTE_TAB case body. The case clause begins with
     `case MSG_PROMOTE_TAB:` and the next case is `case MSG_DEMOTE_ITEM:`. */
  const startIdx = src.indexOf('case MSG_PROMOTE_TAB:');
  assert.ok(startIdx !== -1, 'case MSG_PROMOTE_TAB must exist in storage-handlers.js');
  const endIdx = src.indexOf('case MSG_DEMOTE_ITEM:', startIdx);
  assert.ok(endIdx !== -1, 'case MSG_DEMOTE_ITEM must follow MSG_PROMOTE_TAB');
  const body = src.slice(startIdx, endIdx);

  /* Assert the createItem await is present and well-formed. */
  const createIdx = body.indexOf('await createItem(');
  assert.ok(
    createIdx !== -1,
    'AC3: MSG_PROMOTE_TAB body must `await createItem(...)` (not call it without await)',
  );

  /* Assert the claimTabForItem await is present and well-formed. */
  const claimIdx = body.indexOf('await claimTabForItem(');
  assert.ok(
    claimIdx !== -1,
    'AC3: MSG_PROMOTE_TAB body must `await claimTabForItem(...)` (not call it without await)',
  );

  /* Assert claimTabForItem appears AFTER createItem — sequential ordering
     is the atomicity invariant per §51.D-2. */
  assert.ok(
    claimIdx > createIdx,
    'AC3: claimTabForItem(...) must be awaited AFTER createItem(...) — receiver ordering invariant',
  );

  /* Assert there is a `return newItem` AFTER both awaits — the dispatcher
     only emits SCOPE.ITEMS once the case body returns. */
  const returnIdx = body.indexOf('return newItem;', claimIdx);
  assert.ok(
    returnIdx !== -1,
    'AC3: handler must `return newItem` AFTER claimTabForItem completes (broadcast emits post-return)',
  );
});

/* =========================================================================
   T3 — AC4 regression: promote claim establishment unchanged
   Existing claim semantics: claimsMirror[newItem.id] === tabId AFTER promote.
   This complements T1's broader assertion by isolating the pure-claim
   contract (no group, no Open Tabs filter side-effects).
   ========================================================================= */
test('B-103 T3 (AC4 regression): post-promote, claimsMirror contains {newItem.id: tabId} (claim semantics unchanged)', async () => {
  await bootstrapHandlers();

  __setMockTabs([
    { id: 200, url: 'https://claim-me.example/p', title: 'Claim Me', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  /* Pre-state: no claim. */
  let mirror = getClaimsMirror();
  assert.equal(Object.keys(mirror).length, 0, 'sanity: no claims before promote');

  const resp = await dispatch(MSG_PROMOTE_TAB, { tabId: 200, groupId: null });
  assert.equal(resp.ok, true);
  const newItem = resp.data;

  /* Post-state: exactly one claim, mapping the new item to the promoted tab. */
  mirror = getClaimsMirror();
  assert.equal(Object.keys(mirror).length, 1, 'AC4: exactly one new claim after promote');
  assert.equal(
    mirror[newItem.id], 200,
    'AC4: claimsMirror[newItem.id] === promoted tabId — claim semantics unchanged from pre-fix',
  );
});

/* =========================================================================
   T4 — buildOpenTabs() exclusion regression
   Confirm the SW-side filter (background/tabs/open-tabs.js:41) excludes a
   tab present in claimsMirror. This is the regression guard for §51.D-3 —
   the §50 sidepanel fix is necessary AND sufficient because buildOpenTabs
   already correctly excludes claimed tabs at the SW boundary.
   ========================================================================= */
test('B-103 T4 (D-3 regression): buildOpenTabs() filters out a tab claimed by an item via claimTabForItem', async () => {
  __setMockTabs([
    { id: 300, url: 'https://saved.example/x', title: 'Saved', windowId: 1, active: false, audible: false, index: 0 },
    { id: 301, url: 'https://untracked.example/y', title: 'Untracked', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  /* Reconcile against an empty list — both tabs initially appear in Open Tabs. */
  await reconcileClaims([]);
  const preOpen = buildOpenTabs();
  assert.equal(preOpen.length, 2, 'sanity: both tabs visible pre-claim');

  /* Establish a claim directly via claimTabForItem — mirrors what the
     promote handler does AFTER createItem. */
  await claimTabForItem('item-claim-300', 300);

  /* Filter must now exclude tab 300. */
  const postOpen = buildOpenTabs();
  const postIds = postOpen.map((t) => t.tabId);
  assert.ok(
    !postIds.includes(300),
    'D-3: buildOpenTabs() excludes a tab once it appears in claimsMirror',
  );
  assert.ok(postIds.includes(301), 'D-3: untracked tab still appears in Open Tabs');
  assert.equal(postOpen.length, 1, 'D-3: list shrinks by exactly the claimed tab');
});

/* =========================================================================
   T5 — R4 H-1 regression: patchOpenTabsSection called AFTER _itemById in
   the 'patch' branch. Read-only assertion against sidepanel.js to prove the
   ordering fix lives at the expected lines. Mirrors B-102 T6's intent for
   the promote-shaped scenario: the sidepanel cache surfaces (`_itemById`)
   are populated before `patchOpenTabsSection` runs so any per-row lookup
   inside the patch sees fresh data.
   ========================================================================= */
test('B-103 T5 (R4 H-1 regression): patchOpenTabsSection in the patch branch is positioned AFTER _itemById rebuild', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'sidepanel', 'sidepanel.js'),
    'utf8',
  );

  /* Locate the 'patch' branch. */
  const patchBranchIdx = src.indexOf("} else if (delta.deltaType === 'patch')");
  assert.ok(
    patchBranchIdx !== -1,
    "sidepanel.js must contain the `} else if (delta.deltaType === 'patch')` branch",
  );

  /* Find the next 'full-rebuild' fallback or the end-of-block sentinel
     after the patch branch — the patch branch body sits between these. */
  const fallbackIdx = src.indexOf("'full-rebuild' deltas fall through", patchBranchIdx);
  assert.ok(
    fallbackIdx !== -1,
    'sidepanel.js must contain the full-rebuild fallthrough comment as a section terminator',
  );
  const branchBody = src.slice(patchBranchIdx, fallbackIdx);

  /* The B-102 + B-103 R4 H-1 ordering invariant: inside the !hasReorder
     block, _itemById is rebuilt BEFORE patchOpenTabsSection is called. */
  const itemByIdIdx = branchBody.indexOf('_itemById = new Map(');
  assert.ok(itemByIdIdx !== -1, 'patch branch must rebuild _itemById = new Map(...)');
  const patchCallIdx = branchBody.indexOf('patchOpenTabsSection(_cachedOpenTabs)', itemByIdIdx);
  assert.ok(
    patchCallIdx !== -1,
    'patch branch must contain patchOpenTabsSection(_cachedOpenTabs) AFTER _itemById rebuild',
  );
  assert.ok(
    patchCallIdx > itemByIdIdx,
    'R4 H-1 ordering invariant: patchOpenTabsSection MUST be positioned AFTER _itemById = new Map(...) — fixes the stale lookup race that caused the original H-1 finding',
  );

  /* The R4 M-1 ordering invariant: patchOpenTabsSection must live INSIDE
     the if (allApplied) block so the partial-patch abort path falls through
     to renderAll without double-rendering Open Tabs. Verified by checking
     that the patchOpenTabsSection call appears AFTER an `if (allApplied) {`
     gate inside the same branch body. */
  const allAppliedGateIdx = branchBody.indexOf('if (allApplied) {');
  assert.ok(allAppliedGateIdx !== -1, 'patch branch must include an `if (allApplied) {` gate');
  assert.ok(
    patchCallIdx > allAppliedGateIdx,
    'R4 M-1 ordering invariant: patchOpenTabsSection MUST be guarded by `if (allApplied)` — abort path falls through to renderAll',
  );
});

/* =========================================================================
   T6 — Audible-promote regression (§51 §51.4 edge case)
   Promote a tab that is currently audible. Verify the SW-side state — the
   live-state derivation for the new item correctly reflects audible: true
   while the tab is open and claimed. The DOM-side audible icon is owned by
   buildItemRow + the LIVE_STATE broadcast; this test confirms the upstream
   data is correct so the icon will render once the live-state broadcast
   propagates (per §51 §51.4 follow-up note).
   ========================================================================= */
test('B-103 T6 (audible promote regression): promoting an audible tab yields liveStates[newItem].audible === true', async () => {
  await bootstrapHandlers();

  /* Tab is live AND audible — typical "background tab playing media" case. */
  __setMockTabs([
    { id: 400, url: 'https://music.example/play', title: 'Now Playing', windowId: 1, active: false, audible: true, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  const resp = await dispatch(MSG_PROMOTE_TAB, { tabId: 400, groupId: null });
  assert.equal(resp.ok, true, 'promote of audible tab must succeed');
  const newItem = resp.data;

  /* The live-state derivation reads claimsMirror + the live-tab-index entry.
     Verify the tab entry still records audible: true and the claim is wired,
     so the next MSG_LIST_ITEMS round-trip's `liveStates[newItem.id].audible`
     will be true. */
  const mirror = getClaimsMirror();
  assert.equal(mirror[newItem.id], 400, 'claim wired to the audible tab');

  /* Use buildLiveStates (the same derivation MSG_LIST_ITEMS uses) to verify
     the sidepanel will see audible: true on the next broadcast-driven refetch. */
  const { buildLiveStates } = await import('../background/tabs/tab-claims.js');
  const liveStates = buildLiveStates([{ id: newItem.id, url: newItem.url, sortOrder: 0 }]);
  assert.equal(
    liveStates[newItem.id].live, true,
    'AC1: new bookmark is live (claimed + tab in live index)',
  );
  assert.equal(
    liveStates[newItem.id].audible, true,
    '§51.4 audible-promote: new bookmark inherits audible: true from the underlying tab — DOM audible icon will render on the next LIVE_STATE broadcast',
  );
});
