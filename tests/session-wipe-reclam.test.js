import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC8: session wiped (browser restart) — reconcileClaims rebuilds from scratch', async () => {
  __setMockTabs([
    { id: 10, url: 'https://foo.com', windowId: 1, active: false, audible: false },
    { id: 20, url: 'https://bar.com', windowId: 1, active: true, audible: true },
  ]);
  await buildLiveTabIndex();

  // Session storage is empty (simulating browser restart — chrome clears session)
  // __resetMock already ensures sessionStore is empty

  const items = [
    { id: 'foo', url: 'https://foo.com', sortOrder: 0 },
    { id: 'bar', url: 'https://bar.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const claims = getClaimsMirror();
  assert.equal(claims['foo'], 10, 'foo should be claimed by tab 10');
  assert.equal(claims['bar'], 20, 'bar should be claimed by tab 20');

  const states = buildLiveStates(items);
  assert.equal(states['foo'].live, true);
  assert.equal(states['bar'].live, true);
  assert.equal(states['bar'].active, true, 'bar tab is active');
  assert.equal(states['bar'].audible, true, 'bar tab is audible');
});

test('AC8: no stale claims from previous session are carried forward', async () => {
  __setMockTabs([
    { id: 5, url: 'https://new.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  // Session is empty (wiped by browser restart). No stale claims to validate.
  const items = [
    { id: 'old-item', url: 'https://old.com', sortOrder: 0 },
    { id: 'new-item', url: 'https://new.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const claims = getClaimsMirror();
  assert.equal(claims['old-item'], undefined, 'old-item URL has no matching tab');
  assert.equal(claims['new-item'], 5, 'new-item should be claimed from scratch');
});
