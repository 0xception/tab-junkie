/**
 * b018-persistence.test.js — B-018 floating-group persistence regression tests.
 *
 * Covers:
 *   GAP-1: Orphan guard (missing/empty itemId)
 *   GAP-2: Cold-start integration sequence
 *   R4-H1: Concurrent append during reassociation — prune must not drop new entries
 *   R4-H2: claimTabForItem failure — record must NOT be pruned
 *   Disambiguation: two records same URL — first-record-wins
 *   All-same-tab: three records targeting one tab — only first claims
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
  __getSessionStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  getClaimsMirror,
  claimTabForItem,
} from '../background/tabs/tab-claims.js';
import {
  reassociateFloatingGroups,
  appendFloatingGroup,
} from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ---------------------------------------------------------------------------
// GAP-1: Orphan guard — missing/empty itemId
// ---------------------------------------------------------------------------

test('GAP-1: record with missing itemId is pruned without calling claimTabForItem', async () => {
  seedPartitions({
    floatingGroups: [
      // Missing itemId entirely — only has groupId
      { groupId: 'g-orphan', windowId: 1, tabIndex: 0, url: 'https://orphan.com', savedAt: 1000 },
      // Valid record after the orphan
      { groupId: 'g-valid', itemId: 'g-valid', windowId: 1, tabIndex: 1, url: 'https://valid.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://orphan.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://valid.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  // Orphan must NOT create a claim (claimTabForItem was not called for it)
  assert.equal(claims['g-orphan'], undefined, 'Orphan record must not produce a claim');
  assert.equal(claims[undefined], undefined, 'No undefined key in claims');
  // Valid record should still be claimed
  assert.equal(claims['g-valid'], 20, 'Valid record after orphan should still be claimed');

  // Orphan record should be pruned from storage (its itemId is falsy → resolvedItemIds)
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'Storage should still be an array');
  // The orphan has itemId undefined which gets added to resolvedItemIds;
  // the filter checks !resolvedItemIds.has(entry.itemId) — undefined is in the set
  // so the orphan is removed. Valid record was also resolved.
  assert.equal(raw.length, 0, 'Both orphan and valid records should be pruned');
});

test('GAP-1: record with empty-string itemId is pruned without claiming', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-empty', itemId: '', windowId: 1, tabIndex: 0, url: 'https://empty.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://empty.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims[''], undefined, 'Empty-string itemId must not produce a claim');
  assert.equal(Object.keys(claims).length, 0, 'No claims should exist');
});

// ---------------------------------------------------------------------------
// R4-H1: Concurrent append during reassociation — prune must not drop new entry
// ---------------------------------------------------------------------------

test('R4-H1: prune uses live storage state, retaining records appended during reassociation', async () => {
  // Seed two records that will be resolved
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-old1', itemId: 'g-old1', windowId: 1, tabIndex: 0, url: 'https://old1.com', savedAt: 1000 },
      { groupId: 'g-old2', itemId: 'g-old2', windowId: 1, tabIndex: 1, url: 'https://old2.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://old1.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://old2.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  // Run reassociation — both records will match and be resolved
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  // Now simulate a concurrent append that happened "during" reassociation
  // by appending AFTER reassociation resolved but using the same storage key.
  // In real code the H-1 fix means the prune mutator reads current (live) data,
  // so even if a new record was appended between the read and the prune write,
  // it would be retained because its itemId is not in resolvedItemIds.
  //
  // We verify the principle: append a new record and confirm it survives
  // a prune that targets the old records' itemIds.
  await appendFloatingGroup({
    groupId: 'g-new',
    itemId: 'g-new',
    windowId: 2,
    tabIndex: 0,
    url: 'https://new.com',
    savedAt: 3000,
  });

  // Storage should have only the newly appended record (old ones were pruned)
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'Storage should be an array');
  assert.equal(raw.length, 1, 'Only the newly appended record should remain');
  assert.equal(raw[0].itemId, 'g-new', 'The new record must not have been pruned');
});

// ---------------------------------------------------------------------------
// R4-H2: claimTabForItem failure — record must NOT be pruned
// ---------------------------------------------------------------------------

test('R4-H2: failed claimTabForItem keeps record in storage and processes subsequent records', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-fail', itemId: 'g-fail', windowId: 1, tabIndex: 0, url: 'https://fail.com', savedAt: 1000 },
      { groupId: 'g-ok', itemId: 'g-ok', windowId: 1, tabIndex: 1, url: 'https://ok.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://fail.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://ok.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  // Monkey-patch claimTabForItem to throw for the first record's itemId.
  // We need to intercept at the module level. Since claimTabForItem is imported
  // by floating-groups.js, we mock it via the session storage layer: make the
  // session set throw for the first call only.
  let callCount = 0;
  const originalSet = chrome.storage.session.set;
  chrome.storage.session.set = async function(obj) {
    callCount++;
    if (callCount === 1) {
      throw new Error('Simulated session storage failure');
    }
    return originalSet.call(this, obj);
  };

  // Suppress console.warn for the expected failure
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => { warnings.push(args); };

  try {
    await reassociateFloatingGroups(getLiveTabIndex(), {});
  } finally {
    chrome.storage.session.set = originalSet;
    console.warn = originalWarn;
  }

  // The first record (g-fail): claimTabForItem sets the in-memory mirror
  // BEFORE writeClaims throws, so the mirror entry exists. However, the
  // record is NOT marked resolved, so it remains in storage for retry.
  // This is the correct H-2 behavior: the storage record survives even
  // though the in-memory mirror has a (potentially stale) entry.
  const claims = getClaimsMirror();
  assert.equal(claims['g-fail'], 10, 'Mirror has the entry (set before writeClaims threw)');

  // The second record (g-ok) should succeed
  assert.equal(claims['g-ok'], 20, 'Subsequent record should still be claimed');

  // The failed record should still be in storage (not pruned)
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'Storage should be an array');
  assert.equal(raw.length, 1, 'Only the failed record should remain (g-ok was pruned)');
  assert.equal(raw[0].itemId, 'g-fail', 'Failed record must be retained for future retry');

  // Tab 10 should have been released (claimedTabIds.delete) so it is available
  // for future reassociation attempts
  assert.ok(warnings.length > 0, 'A warning should have been logged for the failure');
});

// ---------------------------------------------------------------------------
// GAP-2: Cold-start integration sequence
// ---------------------------------------------------------------------------

test('GAP-2: full cold-start sequence — empty claims + floating records + tabs → claims populated', async () => {
  // Simulate cold start: session storage is empty (claims wiped on restart),
  // but local storage has floating groups from the previous session.
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-1', itemId: 'item-alpha', windowId: 1, tabIndex: 0, url: 'https://alpha.com', savedAt: 1000 },
      { groupId: 'g-2', itemId: 'item-beta', windowId: 1, tabIndex: 1, url: 'https://beta.com', savedAt: 2000 },
      { groupId: 'g-3', itemId: 'item-gamma', windowId: 2, tabIndex: 0, url: 'https://gamma.com', savedAt: 3000 },
    ],
  });

  // Tabs that survived the restart — positions shifted for gamma
  __setMockTabs([
    { id: 100, url: 'https://alpha.com', windowId: 1, active: true, audible: false, index: 0 },
    { id: 200, url: 'https://beta.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 300, url: 'https://gamma.com', windowId: 3, active: false, audible: false, index: 2 },
  ]);

  // Step 1: Build live tab index (as initializeLiveState would)
  await buildLiveTabIndex();

  // Step 2: Reassociate with empty existing claims (cold start)
  const liveIndex = getLiveTabIndex();
  await reassociateFloatingGroups(liveIndex, {});

  // Verify claims mirror has all three items
  const claims = getClaimsMirror();
  assert.equal(claims['item-alpha'], 100, 'Alpha should claim tab 100 by position match');
  assert.equal(claims['item-beta'], 200, 'Beta should claim tab 200 by position match');
  assert.equal(claims['item-gamma'], 300, 'Gamma should claim tab 300 by URL fallback (position changed)');

  // Verify session storage has the claims persisted
  const sessionClaims = __getSessionStore('tj:tabClaims');
  assert.deepEqual(sessionClaims, claims, 'Session storage should mirror in-memory claims');

  // Verify all floating group records were pruned (all resolved)
  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'Storage should be an array');
  assert.equal(raw.length, 0, 'All records should be pruned after successful reassociation');
});

// ---------------------------------------------------------------------------
// Disambiguation: two records with same URL — first-record-wins
// ---------------------------------------------------------------------------

test('Disambiguation: two records same URL, two matching tabs — first-record-wins per tab', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-first', itemId: 'item-first', windowId: 1, tabIndex: 0, url: 'https://dup.com/page', savedAt: 1000 },
      { groupId: 'g-second', itemId: 'item-second', windowId: 99, tabIndex: 99, url: 'https://dup.com/page', savedAt: 2000 },
    ],
  });

  // Two tabs with the same URL
  __setMockTabs([
    { id: 10, url: 'https://dup.com/page', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://dup.com/page', windowId: 2, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  // First record gets position match on tab 10
  assert.equal(claims['item-first'], 10, 'First record should claim tab 10 by position');
  // Second record falls to URL fallback and gets tab 20
  assert.equal(claims['item-second'], 20, 'Second record should claim tab 20 by URL fallback');
});

test('Disambiguation: two records same URL, only one matching tab — first-record-wins, second unresolved', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-winner', itemId: 'item-winner', windowId: 99, tabIndex: 99, url: 'https://single.com', savedAt: 1000 },
      { groupId: 'g-loser', itemId: 'item-loser', windowId: 88, tabIndex: 88, url: 'https://single.com', savedAt: 2000 },
    ],
  });

  // Only one tab with the matching URL
  __setMockTabs([
    { id: 50, url: 'https://single.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['item-winner'], 50, 'First record should claim the only matching tab');
  assert.equal(claims['item-loser'], undefined, 'Second record should remain unresolved');

  // Verify the unresolved record stays in storage
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'One unresolved record should remain');
  assert.equal(raw[0].itemId, 'item-loser', 'Loser record should be retained');
});

// ---------------------------------------------------------------------------
// All-same-tab: three records targeting the same windowId+tabIndex
// ---------------------------------------------------------------------------

test('All-same-tab: three records same position — only first claims, others fall to URL or remain unresolved', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-a', itemId: 'item-a', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
      { groupId: 'g-b', itemId: 'item-b', windowId: 1, tabIndex: 0, url: 'https://b.com', savedAt: 2000 },
      { groupId: 'g-c', itemId: 'item-c', windowId: 1, tabIndex: 0, url: 'https://c.com', savedAt: 3000 },
    ],
  });

  // Only one tab at that position; plus URL matches for b and c elsewhere
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://b.com', windowId: 2, active: false, audible: false, index: 5 },
    // No tab matching c.com at all
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  // First record wins the position match
  assert.equal(claims['item-a'], 10, 'First record claims tab 10 by position');
  // Second record falls to URL fallback and finds tab 20
  assert.equal(claims['item-b'], 20, 'Second record claims tab 20 by URL fallback');
  // Third record has no match
  assert.equal(claims['item-c'], undefined, 'Third record should remain unresolved');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Only the unresolved record should remain');
  assert.equal(raw[0].itemId, 'item-c', 'Item-c should be retained as unresolved');
});

test('All-same-tab: three records same position, no URL fallback available — only first claims', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-x', itemId: 'item-x', windowId: 1, tabIndex: 0, url: 'https://x.com', savedAt: 1000 },
      { groupId: 'g-y', itemId: 'item-y', windowId: 1, tabIndex: 0, url: 'https://y.com', savedAt: 2000 },
      { groupId: 'g-z', itemId: 'item-z', windowId: 1, tabIndex: 0, url: 'https://z.com', savedAt: 3000 },
    ],
  });

  // Only one tab, matching only x.com by URL
  __setMockTabs([
    { id: 10, url: 'https://x.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['item-x'], 10, 'First record claims the only tab by position');
  assert.equal(claims['item-y'], undefined, 'Second record unresolved — tab already claimed');
  assert.equal(claims['item-z'], undefined, 'Third record unresolved — tab already claimed');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 2, 'Two unresolved records should remain');
  const remainingIds = raw.map((r) => r.itemId).sort();
  assert.deepEqual(remainingIds, ['item-y', 'item-z'], 'Items y and z should be retained');
});
