/**
 * floating-multi.test.js — AC11
 * Multiple tabs same group re-associate independently.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC11: two records with same groupId but different positions both re-associate', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-shared', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
      { groupId: 'g-shared-2', windowId: 1, tabIndex: 1, url: 'https://b.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-shared'], 10, 'First record should claim tab 10');
  assert.equal(claims['g-shared-2'], 20, 'Second record should claim tab 20');
});

test('AC11: position match for one does not prevent URL fallback for another', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-pos', windowId: 1, tabIndex: 0, url: 'https://pos.com', savedAt: 1000 },
      { groupId: 'g-url', windowId: 99, tabIndex: 99, url: 'https://url-match.com', savedAt: 2000 },
    ],
  });

  __setMockTabs([
    { id: 100, url: 'https://anything.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://url-match.com', windowId: 2, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-pos'], 100, 'First record should match by position');
  assert.equal(claims['g-url'], 200, 'Second record should fall back to URL match');
});

test('AC11: three floating records — all independently matched', async () => {
  seedPartitions({
    floatingGroups: [
      { groupId: 'g-1', windowId: 1, tabIndex: 0, url: 'https://one.com', savedAt: 1000 },
      { groupId: 'g-2', windowId: 1, tabIndex: 1, url: 'https://two.com', savedAt: 1000 },
      { groupId: 'g-3', windowId: 1, tabIndex: 2, url: 'https://three.com', savedAt: 1000 },
    ],
  });

  __setMockTabs([
    { id: 10, url: 'https://one.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 20, url: 'https://two.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 30, url: 'https://three.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const claims = getClaimsMirror();
  assert.equal(claims['g-1'], 10);
  assert.equal(claims['g-2'], 20);
  assert.equal(claims['g-3'], 30);
});
