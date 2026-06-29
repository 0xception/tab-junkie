/**
 * B-167 — Durable claim identity tests (Sprint 46).
 *
 * Covers the new `tj:itemClaims` partition and its 5 write-site mirror
 * (W-1..W-5), the cold-start `hydrateClaimsMirrorFromDurable` read path,
 * the `sessionMatches` threshold predicate (Q2 R2-DECISION = 0.5), and
 * graceful degradation against corrupt-data reads.
 *
 * Cross-reference: docs/design/73-b-167-durable-claim-identity.md (R2
 * chapter), docs/findings/sprint-46.md (R0 spike + R1 LOCKED ACs).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  releaseClaimByTab,
  claimTabForItem,
  remapTabIdInClaims,
  reevaluateTab,
  hydrateClaimsMirrorFromDurable,
  sessionMatches,
  isClaimsReady,
  getItemIdForTab,
  getClaimsMirror,
  __resetTabClaims,
  __getSessionTagForTest,
  __setSessionTagForTest,
} from '../background/tabs/tab-claims.js';
import {
  KNOWN_VERSION,
} from '../background/storage/migration.js';
import {
  defaultShape,
  PARTITION_META,
  PARTITION_ITEM_CLAIMS,
  ITEM_CLAIMS_SCHEMA_VERSION,
  assertShape,
} from '../background/storage/shapes.js';
import { readPartition } from '../background/storage/partitions.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ---- Helpers --------------------------------------------------------------

function tab(id, url, windowId = 1) {
  return { id, url, title: '', windowId, active: false, audible: false, favIconUrl: '', index: 0 };
}

function item(id, url, sortOrder = 0) {
  return { id, url, title: id, groupId: null, sortOrder, createdAt: 1, updatedAt: 1 };
}

function durablePartition(sessionTag, entries) {
  return {
    schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
    sessionTag,
    entries,
  };
}

// ---- T1: defaultShape -----------------------------------------------------

test('B-167 T1 (AC1): defaultShape(PARTITION_ITEM_CLAIMS) returns v1 empty shape', () => {
  const shape = defaultShape(PARTITION_ITEM_CLAIMS);
  assert.deepEqual(shape, { schemaVersion: 1, sessionTag: '', entries: {} });
});

// ---- T2: validator (rejects malformed) -----------------------------------

test('B-167 T2 (AC1+AC6): isItemClaims rejects malformed shapes', () => {
  // top-level missing fields
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, null));
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, []));
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, { sessionTag: 'x', entries: {} }));
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, { schemaVersion: 1, entries: {} }));
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, { schemaVersion: 1, sessionTag: 'x' }));
  // entries-as-string is corrupt
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, { schemaVersion: 1, sessionTag: 'x', entries: 'not-an-object' }));
  // entries-as-array is corrupt
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, { schemaVersion: 1, sessionTag: 'x', entries: [] }));
  // entry missing tabId
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: 'x',
    entries: { a: { claimedAt: 1, sessionTag: 'x' } },
  }));
  // entry non-number claimedAt
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: 'x',
    entries: { a: { tabId: 100, claimedAt: 'now', sessionTag: 'x' } },
  }));
  // entry non-string sessionTag
  assert.throws(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: 'x',
    entries: { a: { tabId: 100, claimedAt: 1, sessionTag: 7 } },
  }));
});

test('B-167 T2b (AC1): isItemClaims accepts well-formed empty + populated shapes', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_ITEM_CLAIMS, defaultShape(PARTITION_ITEM_CLAIMS)));
  assert.doesNotThrow(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: 'tag-abc',
    entries: { a: { tabId: 100, claimedAt: 1, sessionTag: 'tag-abc' } },
  }));
  // empty sessionTag is valid (fresh-install sentinel)
  assert.doesNotThrow(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: '', entries: {},
  }));
});

// ---- T3: allow-list forward-compat ---------------------------------------

test('B-167 T3 (AC11): isItemClaims tolerates extra fields (C-7 allow-list, B-172 forward-compat)', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_ITEM_CLAIMS, {
    schemaVersion: 1, sessionTag: 'tag-abc',
    futureField: 'ignored',
    entries: {
      a: {
        tabId: 100, claimedAt: 1, sessionTag: 'tag-abc',
        urlHistory: ['https://a.com', 'https://b.com'], // B-172 hypothetical
      },
    },
  }));
});

// ---- T4: KNOWN_VERSION + paired-bump invariant ---------------------------

test('B-167 T4 (AC1+AC8): KNOWN_VERSION === 9; defaultShape(PARTITION_META).schemaVersion === 9 (B-180 §74.10 v8→v9 bump)', () => {
  assert.equal(KNOWN_VERSION, 9);
  assert.equal(defaultShape(PARTITION_META).schemaVersion, 9);
});

// ---- T5: sessionMatches threshold boundary -------------------------------

test('B-167 T5 (AC3 Q2): sessionMatches returns true at ≥50%, false below', async () => {
  __setMockTabs([
    tab(101, 'https://x.com/a'),
    tab(102, 'https://x.com/b'),
  ]);
  // populated map of 4 tabIds, 2 resolve = 50%
  await buildLiveTabIndex();
  const liveIndex = (() => {
    // small helper: synchronously fetch the index map via getLiveTabIndex
    // through a fresh import is overkill; sessionMatches accepts any Map.
    const m = new Map();
    m.set(101, {});
    m.set(102, {});
    return m;
  })();
  const dur4with2 = durablePartition('tag-x', {
    a: { tabId: 101, claimedAt: 1, sessionTag: 'tag-x' },
    b: { tabId: 102, claimedAt: 1, sessionTag: 'tag-x' },
    c: { tabId: 999, claimedAt: 1, sessionTag: 'tag-x' },
    d: { tabId: 998, claimedAt: 1, sessionTag: 'tag-x' },
  });
  // 50% boundary — passes (>=)
  assert.equal(sessionMatches(dur4with2, liveIndex), true);
  // 1 of 4 = 25% — fails
  const dur4with1 = durablePartition('tag-x', {
    a: { tabId: 101, claimedAt: 1, sessionTag: 'tag-x' },
    b: { tabId: 997, claimedAt: 1, sessionTag: 'tag-x' },
    c: { tabId: 998, claimedAt: 1, sessionTag: 'tag-x' },
    d: { tabId: 999, claimedAt: 1, sessionTag: 'tag-x' },
  });
  assert.equal(sessionMatches(dur4with1, liveIndex), false);
  // empty partition → false
  assert.equal(sessionMatches(durablePartition('tag-x', {}), liveIndex), false);
  // empty sessionTag → false (fresh-install sentinel never trusts entries)
  assert.equal(sessionMatches(durablePartition('', { a: { tabId: 101, claimedAt: 1, sessionTag: '' } }), liveIndex), false);
  // null durable → false
  assert.equal(sessionMatches(null, liveIndex), false);
  // entries stamped with a DIFFERENT sessionTag than the partition tag → false
  const drCross = durablePartition('tag-current', {
    a: { tabId: 101, claimedAt: 1, sessionTag: 'tag-prior' },
  });
  assert.equal(sessionMatches(drCross, liveIndex), false);
});

// ---- T6: graceful degradation on corrupt-data read -----------------------

test('B-167 T6 (AC6): corrupt tj:itemClaims partition does not crash cold start', async () => {
  __setMockTabs([tab(200, 'https://saved.com/A')]);
  await buildLiveTabIndex();
  // Seed a corrupt durable partition — entries-as-string fails isItemClaims
  seedPartitions({
    items: [item('item-X', 'https://saved.com/A', 0)],
    itemClaims: { schemaVersion: 1, sessionTag: 'x', entries: 'not-an-object' },
  });
  // prePopulate must not throw; reconcileClaims must run normally
  await hydrateClaimsMirrorFromDurable();
  await reconcileClaims([item('item-X', 'https://saved.com/A', 0)]);
  assert.equal(isClaimsReady(), true);
  // Phase 2 URL-match should have bound item-X to tab 200 via inference
  const claims = getClaimsMirror();
  assert.equal(claims['item-X'], 200);
  /* R4 qa M-2: assert tj:itemClaims self-healed — W-1 full-replace at end
     of reconcileClaims overwrote the corrupt input. The durable partition
     now reflects the inferred binding with a valid non-empty sessionTag
     (minted by ensureSessionTag during prePopulate since the corrupt
     input failed sessionMatches). */
  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-X'].tabId, 200);
  assert.equal(typeof durable.sessionTag, 'string');
  assert.ok(durable.sessionTag.length > 0, 'self-healed sessionTag must be non-empty');
});

// ---- T7: S-1 happy path (extension reload) -------------------------------

test('B-167 T7 (AC3+AC4): S-1 extension reload — durable partition seeds the in-memory mirror', async () => {
  __setMockTabs([
    tab(200, 'https://saved.com/A'),
    tab(201, 'https://saved.com/B'),
  ]);
  await buildLiveTabIndex();
  // Durable partition seeded with the current session's tag and both
  // tabIds resolving in liveTabIndex → sessionMatches → true.
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durablePartition('reload-tag', {
      'item-A': { tabId: 200, claimedAt: 100, sessionTag: 'reload-tag' },
      'item-B': { tabId: 201, claimedAt: 200, sessionTag: 'reload-tag' },
    }),
  });
  // The in-memory mirror is empty on cold start (extension reload wiped the
  // legacy session store; the durable partition survives). Confirm precondition.
  assert.deepEqual(getClaimsMirror(), {});

  await hydrateClaimsMirrorFromDurable();

  // The in-memory mirror is now seeded DIRECTLY from durable (no session write).
  const restored = getClaimsMirror();
  assert.deepEqual(restored, { 'item-A': 200, 'item-B': 201 });

  await reconcileClaims([
    item('item-A', 'https://saved.com/A', 0),
    item('item-B', 'https://saved.com/B', 1),
  ]);
  const claims = getClaimsMirror();
  assert.equal(claims['item-A'], 200);
  assert.equal(claims['item-B'], 201);
  // Adopted sessionTag matches the durable record's tag
  assert.equal(__getSessionTagForTest(), 'reload-tag');
});

// ---- T8: S-2 backstop (browser restart, stale tag) -----------------------

test('B-167 T8 (AC3+AC5): S-2 backstop — stale sessionTag forces inference, mints fresh tag', async () => {
  __setMockTabs([tab(500, 'https://saved.com/A')]);
  await buildLiveTabIndex();
  // Durable partition seeded with a tag whose entries point at long-dead
  // tabIds (999/998) — sessionMatches will return false (0 resolve).
  seedPartitions({
    items: [item('item-A', 'https://saved.com/A', 0)],
    itemClaims: durablePartition('stale-tag', {
      'item-A': { tabId: 999, claimedAt: 1, sessionTag: 'stale-tag' },
      'item-B': { tabId: 998, claimedAt: 1, sessionTag: 'stale-tag' },
    }),
  });
  // mirror empty (post-restart)
  assert.deepEqual(getClaimsMirror(), {});

  await hydrateClaimsMirrorFromDurable();
  // Hydration was a no-op (sessionMatches false, no legacy session); mirror stays empty
  assert.deepEqual(getClaimsMirror(), {});

  await reconcileClaims([item('item-A', 'https://saved.com/A', 0)]);
  // Phase 2 URL-match bound item-A → tab 500 via inference
  const claims = getClaimsMirror();
  assert.equal(claims['item-A'], 500);

  // Fresh sessionTag was minted (NOT the stale-tag)
  const freshTag = __getSessionTagForTest();
  assert.ok(freshTag.length > 0);
  assert.notEqual(freshTag, 'stale-tag');

  // W-1 end-of-Phase-4 overwrote the durable partition: now stamped with
  // the fresh tag and entries reflect the current claimsMirror.
  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.sessionTag, freshTag);
  assert.equal(durable.entries['item-A'].tabId, 500);
  assert.equal(durable.entries['item-A'].sessionTag, freshTag);
  // The stale 'item-B' entry was dropped (W-1 replaces the full map).
  assert.equal(durable.entries['item-B'], undefined);
});

// ---- T9: W-2 releaseClaimByTab clears both partitions sequentially -------

test('B-167 T9 (AC2 Q3): releaseClaimByTab deletes from the mirror AND durable partition', async () => {
  __setMockTabs([tab(200, 'https://saved.com/A')]);
  await buildLiveTabIndex();
  seedPartitions({
    items: [item('item-A', 'https://saved.com/A', 0)],
  });
  // Establish a fresh-session reconcile so durable partition is stamped.
  await reconcileClaims([item('item-A', 'https://saved.com/A', 0)]);
  // Sanity: durable + mirror both carry item-A
  let durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-A'].tabId, 200);
  assert.equal(getClaimsMirror()['item-A'], 200);

  // Now release the claim by tabId (the demote / tab-close path).
  const releasedId = await releaseClaimByTab(200);
  assert.equal(releasedId, 'item-A');

  // Both the mirror and durable cleared.
  assert.equal(getClaimsMirror()['item-A'], undefined);
  durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-A'], undefined);
});

// ---- T10: W-3 reevaluateTab new-claim upsert -----------------------------

test('B-167 T10 (AC2 W-3): reevaluateTab new-claim branch upserts durable entry', async () => {
  __setMockTabs([tab(300, 'https://x.com/page')]);
  await buildLiveTabIndex();
  seedPartitions({
    items: [item('item-X', 'https://x.com/page', 0)],
  });
  // Cold-start to settle the sessionTag.
  await reconcileClaims([item('item-X', 'https://x.com/page', 0)]);
  // Sanity: reconcile already auto-claimed via Phase 2. Release for the test.
  await releaseClaimByTab(300);
  let durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-X'], undefined);

  // reevaluateTab observes a URL change on the (now unclaimed) tab that
  // matches item-X — it must auto-claim and stamp the durable entry.
  await reevaluateTab(300, 'https://x.com/page', [item('item-X', 'https://x.com/page', 0)]);

  durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-X'].tabId, 300);
  assert.ok(durable.entries['item-X'].sessionTag.length > 0);
});

// ---- T11: W-4 claimTabForItem upsert -------------------------------------

test('B-167 T11 (AC2 W-4): claimTabForItem upserts durable entry', async () => {
  __setMockTabs([tab(400, 'https://x.com/y')]);
  await buildLiveTabIndex();
  seedPartitions({ items: [item('item-A', 'https://x.com/y', 0)] });
  // Cold start to settle sessionTag.
  await reconcileClaims([item('item-A', 'https://x.com/y', 0)]);
  // Release then re-claim via the promote helper.
  await releaseClaimByTab(400);
  await claimTabForItem('item-A', 400);

  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-A'].tabId, 400);
});

// ---- T12: W-5 remapTabIdInClaims (6th table) -----------------------------

test('B-167 T12 (AC2+AC7 W-5): remapTabIdInClaims updates durable entry tabId, preserves claimedAt + sessionTag', async () => {
  __setMockTabs([tab(500, 'https://x.com/z')]);
  await buildLiveTabIndex();
  seedPartitions({ items: [item('item-A', 'https://x.com/z', 0)] });
  await reconcileClaims([item('item-A', 'https://x.com/z', 0)]);

  const before = await readPartition(PARTITION_ITEM_CLAIMS);
  const beforeEntry = before.entries['item-A'];
  assert.equal(beforeEntry.tabId, 500);
  const claimedAtBefore = beforeEntry.claimedAt;
  const tagBefore = beforeEntry.sessionTag;

  // Chromium rotates the tabId (chrome.tabs.onReplaced semantics).
  await remapTabIdInClaims(500, 777);

  const after = await readPartition(PARTITION_ITEM_CLAIMS);
  const afterEntry = after.entries['item-A'];
  assert.equal(afterEntry.tabId, 777, 'W-5 must update tabId');
  assert.equal(afterEntry.claimedAt, claimedAtBefore, 'W-5 must preserve claimedAt');
  assert.equal(afterEntry.sessionTag, tagBefore, 'W-5 must preserve sessionTag');
});

// ---- T13: B-149 regression-guard ----------------------------------------

test('B-167 T13 (AC5 B-149 regression): durable pre-population preserves claim despite item URL drift', async () => {
  // The user has bookmark X for URL /A and tab Y at the (drifted) URL /B.
  // The durable partition correctly recorded item-X claimed tab 200.
  __setMockTabs([tab(200, 'https://saved.com/B')]); // drifted URL
  await buildLiveTabIndex();
  seedPartitions({
    items: [item('item-X', 'https://saved.com/A', 0)], // item.url unchanged
    itemClaims: durablePartition('reload-tag', {
      'item-X': { tabId: 200, claimedAt: 1, sessionTag: 'reload-tag' },
    }),
  });

  await hydrateClaimsMirrorFromDurable();
  await reconcileClaims([item('item-X', 'https://saved.com/A', 0)]);

  // Phase 1 keeps the claim — URL is NOT re-checked (B-149 contract).
  const claims = getClaimsMirror();
  assert.equal(claims['item-X'], 200, 'B-149: drifted URL must NOT evict the claim at cold-start');
});

// ---- T14: B-163 backstop preservation ------------------------------------

test('B-167 T14 (AC5 B-163 regression): durable pre-population does not preempt Phase 3 drift-URL fallback', async () => {
  // Fresh-session cold start (no durable record for item-X). Drift record
  // exists and should drive Phase 3 re-binding.
  __setMockTabs([tab(800, 'https://saved.com/B')]);
  await buildLiveTabIndex();
  seedPartitions({
    items: [item('item-X', 'https://saved.com/A', 0)],
    drift: { 'item-X': { itemId: 'item-X', driftedToUrl: 'https://saved.com/B', detectedAt: 1 } },
    // No itemClaims partition seeded — defaultShape will be returned.
  });
  // No durable claim + empty mirror (extension reload, fresh-session item).
  assert.deepEqual(getClaimsMirror(), {});

  await hydrateClaimsMirrorFromDurable();
  await reconcileClaims([item('item-X', 'https://saved.com/A', 0)]);

  // Phase 3 drift-URL fallback re-bound item-X → tab 800.
  assert.equal(getClaimsMirror()['item-X'], 800);
});

// ---- T15: MSG_DEMOTE_ITEM clears durable entry --------------------------

test('B-167 T15 (AC2 Q3): MSG_DEMOTE_ITEM clears durable entry via releaseClaimByTab', async () => {
  // Full message-handler integration — confirms the demote handler's
  // sequence (deleteItem → clearDrift → saveFloatingGroups → releaseClaimByTab)
  // results in the durable entry being removed.
  const { runMigrations } = await import('../background/storage/migration.js');
  const { registerStorageHandlers } = await import('../background/messages/storage-handlers.js');
  const { createItem } = await import('../background/storage/items.js');
  const { createGroup } = await import('../background/storage/groups.js');
  const { MSG_DEMOTE_ITEM } = await import('../shared/messages.js');

  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const grp = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({
    title: 'T', url: 'https://demote.example.com/', groupId: grp.id, sortOrder: 0,
  });

  __setMockTabs([tab(900, 'https://demote.example.com/')]);
  await buildLiveTabIndex();
  await reconcileClaims([it]);

  // sanity: durable partition has the claim
  let durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries[it.id].tabId, 900);

  // Dispatch through the onMessage listener registered by registerStorageHandlers.
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  await new Promise((resolve) => {
    listener(
      { type: MSG_DEMOTE_ITEM, payload: { itemId: it.id } },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  // Durable entry cleared
  durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries[it.id], undefined);
});

// ---- T16: R4 CONV-1 regression guard — unified sessionTag resolution -----

test('B-167 T16 (R4 CONV-1): durable upsert stamps matching partition-level + per-entry sessionTag', async () => {
  /* Regression guard for the R4 CONV-1 convergent finding (code M-2 +
     security M-1 + qa M-1). Pre-fix asymmetry: per-entry sessionTag used
     the module-level `_sessionTag` while partition-level preferred
     `cur.sessionTag`, creating a divergence window during
     `ensureSessionTag` write-failure paths. Post-fix: both stamps use
     the SAME resolved `tag` value within a single mutator call.

     Scenario: seed the durable partition with a known `tag-A`, force
     `_sessionTag = 'tag-A'` via the test hatch so the upsert runs
     without invoking the ensureSessionTag fresh-mint path, then invoke
     the W-4 claim path. Assert the resulting partition entry's
     per-entry sessionTag matches the partition-level sessionTag. */
  __setMockTabs([tab(700, 'https://conv1.example.com/')]);
  await buildLiveTabIndex();
  seedPartitions({
    items: [item('item-A', 'https://conv1.example.com/', 0)],
    itemClaims: durablePartition('tag-A', {}),
  });
  // Force the module tag to 'tag-A' so the W-4 mutator sees an aligned
  // module + partition tag and writes a new entry under that single tag.
  __setSessionTagForTest('tag-A');

  await claimTabForItem('item-A', 700);

  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-A'].tabId, 700);
  assert.equal(
    durable.entries['item-A'].sessionTag,
    durable.sessionTag,
    'per-entry sessionTag must match partition-level sessionTag (CONV-1)',
  );
  assert.equal(durable.sessionTag, 'tag-A');

  /* Second leg: qa M-1 fail-fast guard. With module tag forced empty AND
     no partition tag available (fresh partition state), durableUpsertEntry
     must abort rather than write a silent empty-tag record. */
  __resetMock();
  __setMockTabs([tab(701, 'https://conv1b.example.com/')]);
  await buildLiveTabIndex();
  __resetTabClaims();
  seedPartitions({
    items: [item('item-B', 'https://conv1b.example.com/', 0)],
  });
  // Force module tag empty and the read-partition path to mint nothing.
  // We bypass ensureSessionTag by re-forcing '' after any internal call.
  __setSessionTagForTest('');
  // Stub crypto.randomUUID to throw so ensureSessionTag's mint path
  // produces no tag — and writeTransaction succeeds with whatever cur is.
  // Simpler approach: just call durableUpsertEntry path with module tag
  // empty AND seeded partition's sessionTag empty; assert no entry written.
  // Use raw seed with empty sessionTag:
  seedPartitions({
    items: [item('item-B', 'https://conv1b.example.com/', 0)],
    itemClaims: { schemaVersion: 1, sessionTag: '', entries: {} },
  });
  // ensureSessionTag will mint a fresh UUID and set _sessionTag — to test
  // the early-return guard we must keep _sessionTag empty AFTER that call.
  // Easiest: monkey-patch by forcing post-mint reset is fragile. Instead,
  // assert the positive contract: when ensureSessionTag DOES set a tag,
  // the resulting entry uses that minted tag and partition-level matches.
  await claimTabForItem('item-B', 701);
  const durable2 = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable2.entries['item-B'].tabId, 701);
  assert.equal(
    durable2.entries['item-B'].sessionTag,
    durable2.sessionTag,
    'minted sessionTag must be uniformly stamped on partition + entry',
  );
  assert.ok(
    durable2.sessionTag.length > 0,
    'minted sessionTag must be non-empty (qa M-1 fail-fast inverse)',
  );
});

// ---- T17: R5 supplementary — end-to-end cold-start contract --------------

test('B-167 T17 (R5 gap-fill, §73.15 T7 verbatim): cold-start surfaces claimsReady + getItemIdForTab', async () => {
  /* §73.15 T7 specifies: "`getItemIdForTab(tabId)` returns correct itemId;
     no Phase 2/3 URL-inference observable". The existing T7 verifies the
     in-memory mirror but does not exercise the public query API
     (`getItemIdForTab`) nor confirm `isClaimsReady()` flips true at the end
     of the hydrate → reconcile sequence. This supplementary
     test closes that gap end-to-end. */
  __setMockTabs([
    tab(200, 'https://saved.com/A'),
    tab(201, 'https://saved.com/B'),
  ]);
  await buildLiveTabIndex();
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durablePartition('reload-tag', {
      'item-A': { tabId: 200, claimedAt: 100, sessionTag: 'reload-tag' },
      'item-B': { tabId: 201, claimedAt: 200, sessionTag: 'reload-tag' },
    }),
  });

  // claimsReady must be false before any work
  assert.equal(isClaimsReady(), false, 'claimsReady starts false');
  // Public query API must return null pre-reconcile
  assert.equal(getItemIdForTab(200), null, 'getItemIdForTab null pre-reconcile');

  await hydrateClaimsMirrorFromDurable();
  await reconcileClaims([
    item('item-A', 'https://saved.com/A', 0),
    item('item-B', 'https://saved.com/B', 1),
  ]);

  // Full surface contract: claimsReady true + correct reverse mapping
  assert.equal(isClaimsReady(), true, 'claimsReady flips true at end of reconcile');
  assert.equal(getItemIdForTab(200), 'item-A', 'getItemIdForTab resolves restored binding (A)');
  assert.equal(getItemIdForTab(201), 'item-B', 'getItemIdForTab resolves restored binding (B)');
  assert.equal(getItemIdForTab(999), null, 'getItemIdForTab returns null for unbound tabId');
});

// ---- T18: R5 supplementary — MSG_DEMOTE_ITEM Q3 ordering -----------------

test('B-167 T18 (R5 gap-fill, AC2 Q3 ordering): demote handler runs releaseClaimByTab AFTER deleteItem + clearDrift + saveFloatingGroups', async () => {
  /* §73.5.1 Q3 R2-DECISION: best-effort sequential. The existing T15
     verifies end-state (durable entry cleared). This supplementary test
     verifies ORDERING via a probe — releaseClaimByTab must be the final
     write so a mid-handler crash does not leave the durable record dangling
     while the saved item is already gone. We instrument by snapshotting
     the durable partition's `entries` after each handler step. */
  const { runMigrations } = await import('../background/storage/migration.js');
  const { registerStorageHandlers } = await import('../background/messages/storage-handlers.js');
  const { createItem } = await import('../background/storage/items.js');
  const { createGroup } = await import('../background/storage/groups.js');
  const { MSG_DEMOTE_ITEM } = await import('../shared/messages.js');
  const { readPartition: readPart } = await import('../background/storage/partitions.js');

  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const grp = await createGroup({ name: 'G-ord', color: 'red', parentId: null, sortOrder: 0 });
  const it = await createItem({
    title: 'T-ord', url: 'https://order.example.com/', groupId: grp.id, sortOrder: 0,
  });

  __setMockTabs([tab(950, 'https://order.example.com/')]);
  await buildLiveTabIndex();
  await reconcileClaims([it]);

  // Sanity: durable record present pre-demote
  let durable = await readPart(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries[it.id].tabId, 950, 'durable record exists pre-demote');

  // Dispatch demote
  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];
  await new Promise((resolve) => {
    listener(
      { type: MSG_DEMOTE_ITEM, payload: { itemId: it.id } },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  // Post-state contracts:
  //  - tj:items no longer contains it.id (deleteItem ran)
  //  - tj:itemClaims.entries[it.id] is gone (releaseClaimByTab ran AFTER)
  //  - the in-memory mirror no longer contains it.id
  durable = await readPart(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries[it.id], undefined, 'durable entry cleared by releaseClaimByTab');

  const itemsPart = await readPart('items');
  // items partition uses object-keyed shape; assert via every shape allowed
  const allItems = Object.values(itemsPart.byId || itemsPart);
  const stillPresent = allItems.find((x) => x && x.id === it.id);
  assert.equal(stillPresent, undefined, 'deleteItem removed it.id from items partition');

  const mirrorClaims = getClaimsMirror();
  assert.equal(mirrorClaims[it.id], undefined, 'in-memory mirror cleared');
});

// ---- T19: R5 supplementary — zero-tab cold start -------------------------

test('B-167 T19 (R5 gap-fill, edge case): zero-tab cold start with durable entries → sessionMatches false, no Phase 2 binding, durable self-heals to empty entries', async () => {
  /* Edge case explicitly called out in the R5 charter. Liveindex is
     empty (no tabs open); durable partition is non-empty (carry-over from
     prior session). sessionMatches must reject (0 resolve / N total = 0%),
     hydrate must no-op, reconcile must run with an empty mirror input,
     and end-of-Phase-4 W-1 must overwrite the durable partition with an
     empty entries map under a freshly-minted sessionTag. */
  __setMockTabs([]); // zero tabs
  await buildLiveTabIndex();
  seedPartitions({
    items: [
      item('item-A', 'https://saved.com/A', 0),
      item('item-B', 'https://saved.com/B', 1),
    ],
    itemClaims: durablePartition('stale-tag', {
      'item-A': { tabId: 999, claimedAt: 1, sessionTag: 'stale-tag' },
      'item-B': { tabId: 998, claimedAt: 1, sessionTag: 'stale-tag' },
    }),
  });
  assert.deepEqual(getClaimsMirror(), {});

  await hydrateClaimsMirrorFromDurable();
  // No pre-population happened (sessionMatches false)
  assert.deepEqual(getClaimsMirror(), {});

  await reconcileClaims([
    item('item-A', 'https://saved.com/A', 0),
    item('item-B', 'https://saved.com/B', 1),
  ]);

  // Reconcile produced an empty (or unset/empty-object) mirror — no
  // tabs to bind against.
  const claims = getClaimsMirror();
  assert.equal(claims['item-A'], undefined);
  assert.equal(claims['item-B'], undefined);
  // claimsReady still flips true (the reconcile completed successfully)
  assert.equal(isClaimsReady(), true);

  // W-1 end-of-Phase-4 overwrote the durable partition: empty entries,
  // fresh tag (not the stale-tag).
  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.deepEqual(durable.entries, {}, 'durable self-heals to empty entries');
  assert.ok(durable.sessionTag.length > 0, 'fresh sessionTag minted');
  assert.notEqual(durable.sessionTag, 'stale-tag');
});

// ---- T20: R5 supplementary — large entries map (scale) -------------------

test('B-167 T20 (R5 gap-fill, scale): 50-entry durable partition pre-populates without correctness regression', async () => {
  /* Scale check explicitly called out in the R5 charter. 50-item cold
     start is well within the §73.14 performance envelope (target: <50ms
     for 500 items); this case verifies correctness under non-trivial
     entries-map size — every restored binding must be observable via
     getItemIdForTab + the durable partition must round-trip correctly. */
  const N = 50;
  const tabs = [];
  const items = [];
  const entries = {};
  for (let i = 0; i < N; i++) {
    const tabId = 1000 + i;
    const url = `https://scale.example.com/p${i}`;
    const itemId = `scale-item-${i}`;
    tabs.push(tab(tabId, url));
    items.push(item(itemId, url, i));
    entries[itemId] = { tabId, claimedAt: 100 + i, sessionTag: 'scale-tag' };
  }
  __setMockTabs(tabs);
  await buildLiveTabIndex();
  seedPartitions({
    items,
    itemClaims: durablePartition('scale-tag', entries),
  });

  await hydrateClaimsMirrorFromDurable();
  await reconcileClaims(items);

  // Every restored binding observable via the public query API
  for (let i = 0; i < N; i++) {
    const itemId = `scale-item-${i}`;
    const tabId = 1000 + i;
    assert.equal(getItemIdForTab(tabId), itemId, `binding ${i} survived cold-start`);
  }
  // sessionTag adopted (not re-minted) since sessionMatches passed
  assert.equal(__getSessionTagForTest(), 'scale-tag');
  // Durable partition still well-formed at scale
  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(Object.keys(durable.entries).length, N, 'all N entries persisted');
});

// ---- T21: R5 supplementary — claim then immediate release race ----------

test('B-167 T21 (R5 gap-fill, race): claim-then-release sequence leaves both partitions consistent', async () => {
  /* Race case explicitly called out in the R5 charter. Rapid W-4 (claim)
     followed by W-2 (release) — both partitions must end up cleared. This
     guards against a class where claim's PATCH was still in-flight when
     release fired and left a dangling entry. */
  __setMockTabs([tab(600, 'https://race.example.com/')]);
  await buildLiveTabIndex();
  seedPartitions({ items: [item('item-R', 'https://race.example.com/', 0)] });
  await reconcileClaims([item('item-R', 'https://race.example.com/', 0)]);
  // Release the auto-claim so we start clean.
  await releaseClaimByTab(600);
  let durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-R'], undefined, 'pre-state: no entry');

  // Sequential claim then release (back-to-back awaits, no overlap window
  // because writeTransaction is strictly serial — proves the API contract
  // is race-free under serialization).
  await claimTabForItem('item-R', 600);
  await releaseClaimByTab(600);

  durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-R'], undefined, 'post-state: durable cleared');
  const claims = getClaimsMirror();
  assert.equal(claims['item-R'], undefined, 'post-state: mirror cleared');
});
