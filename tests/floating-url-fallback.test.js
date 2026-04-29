/**
 * floating-url-fallback.test.js — AC9 (B-121 §60.4 contract update)
 * URL fallback when position fails. Post-S38 contract:
 *   - reassociateFloatingGroups DOES NOT write claims.
 *   - Records whose URL-matched tab is unclaimed are retained.
 *   - Records whose URL-matched tab is already claimed are pruned.
 *   - Records with no matching tab are retained (AC9).
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

test('AC9: URL fallback resolves when position fails — record retained (unclaimed)', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-fall', groupId: 'g-fall', parentItemId: 'p-fall', windowId: 99, tabIndex: 0, url: 'https://fallback.com/page', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 50, url: 'https://fallback.com/page', windowId: 2, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* No claim written. Record retained for runtime render. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC9: URL fallback uses normalized comparison (record retained)', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-norm', groupId: 'g-norm', parentItemId: 'p-norm', windowId: 99, tabIndex: 0, url: 'https://Example.COM/path', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 60, url: 'https://example.com/path', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC9: unmatched record remains in tj:floatingGroups', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-r', groupId: 'g-resolved', parentItemId: 'p-resolved', windowId: 1, tabIndex: 0, url: 'https://found.com', savedAt: 1000 },
      { floatingTabId: 'ft-u', groupId: 'g-unresolved', parentItemId: 'p-unresolved', windowId: 99, tabIndex: 99, url: 'https://missing.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://found.com', windowId: 1, active: false, audible: false, index: 0 },
    // No tab matches g-unresolved by position or URL
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Both records retained: ft-r matched-unclaimed; ft-u unmatched. */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 2);
});

test('AC9: no match at all — record retained for next restart', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-orphan', groupId: 'g-orphan', parentItemId: 'p-orphan', windowId: 5, tabIndex: 5, url: 'https://gone.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 70, url: 'https://totally-different.com', windowId: 2, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});
