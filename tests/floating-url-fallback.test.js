/**
 * floating-url-fallback.test.js — AC9
 * URL fallback when position fails; unresolved retained.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC9: URL fallback when position does not match', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-fall', itemId: 'g-fall', windowId: 99, tabIndex: 0, url: 'https://fallback.com/page', savedAt: 1000 },
    ],
  });

  // No tab at window 99, but tab with matching URL exists
  __setMockTabs([
    { id: 50, url: 'https://fallback.com/page', windowId: 2, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-fall'], 50, 'Should fall back to URL match when position fails');
});

test('AC9: URL fallback uses normalized comparison', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-norm', itemId: 'g-norm', windowId: 99, tabIndex: 0, url: 'https://Example.COM/path', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 60, url: 'https://example.com/path', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-norm'], 60, 'URL fallback should match after normalization');
});

test('AC9: unresolved records remain in tj:floatingGroups', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-resolved', itemId: 'g-resolved', windowId: 1, tabIndex: 0, url: 'https://found.com', savedAt: 1000 },
      { groupId: 'g-unresolved', itemId: 'g-unresolved', windowId: 99, tabIndex: 99, url: 'https://missing.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://found.com', windowId: 1, active: false, audible: false, index: 0 },
    // No tab matches g-unresolved by position or URL
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'Should still be an array');
  assert.equal(raw.length, 1, 'Only unresolved record should remain');
  assert.equal(raw[0].groupId, 'g-unresolved', 'Unresolved record should be retained');
});

test('AC9: no match at all — record fully retained', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-orphan', itemId: 'g-orphan', windowId: 5, tabIndex: 5, url: 'https://gone.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 70, url: 'https://totally-different.com', windowId: 2, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(Object.keys(claims).length, 0, 'No claim should be established');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1, 'Unresolved record should remain');
  assert.equal(raw[0].groupId, 'g-orphan');
});
