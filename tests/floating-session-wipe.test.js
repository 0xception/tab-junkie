/**
 * floating-session-wipe.test.js — AC12 (B-121 §60.4 contract update)
 * storage.session wipe must not lose tj:floatingGroups records.
 * Post-S38: reassociateFloatingGroups does NOT write claims; records
 * remain in storage for runtime render.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getRawStore, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { reassociateFloatingGroups } from '../background/tabs/floating-groups.js';
import { readPartition } from '../background/storage/partitions.js';
import { PARTITION_ITEM_CLAIMS } from '../background/storage/shapes.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC12: storage.session wipe does not lose floating-group records', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-survive', groupId: 'g-survive', parentItemId: 'p-survive', windowId: 1, tabIndex: 0, url: 'https://survive.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();

  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].groupId, 'g-survive');
});

test('AC12: cold-start replay preserves matched-unclaimed records', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-cold', groupId: 'g-cold', parentItemId: 'p-cold', windowId: 1, tabIndex: 0, url: 'https://cold.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();
  __resetLiveTabIndex();
  __resetTabClaims();

  __setMockTabs([
    { id: 5, url: 'https://cold.com', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Post-S38: no claim written. Record retained for runtime render. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

test('AC12 / B-179: durable tab claims SURVIVE a session wipe; floating-group records survive in local', async () => {
  /* Post-B-179 claims live in the durable tj:itemClaims (chrome.storage.local)
     partition, not chrome.storage.session. A session wipe therefore no longer
     clears claims — the whole point of the cutover. Floating-group records
     (also local) survive too. */
  seedPartitions({
    itemClaims: {
      schemaVersion: 1,
      sessionTag: 'sess-x',
      entries: { 'item-1': { tabId: 10, claimedAt: 1, sessionTag: 'sess-x' } },
    },
    floatingGroups: [
      { floatingTabId: 'ft-persist', groupId: 'g-persist', parentItemId: 'p-persist', windowId: 1, tabIndex: 0, url: 'https://persist.com', savedAt: 1000 },
    ],
  });

  await chrome.storage.session.clear();

  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  assert.equal(durable.entries['item-1'].tabId, 10, 'durable claim survives the session wipe');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});
