import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __getSessionStore } from './chrome-mock.js';
import { buildLiveTabIndex, updateTabEntry, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, reevaluateTab, buildLiveStates, __resetTabClaims } from '../background/tabs/tab-claims.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC6: tab URL change releases old claim and assigns to matching item', async () => {
  __setMockTabs([
    { id: 50, url: 'https://itemA.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'itemA', url: 'https://itemA.com', sortOrder: 0 },
    { id: 'itemB', url: 'https://itemB.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  // itemA should be claimed
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['itemA'], 50);
  assert.equal(claims['itemB'], undefined);

  // Simulate tab navigating to itemB's URL
  updateTabEntry(50, { url: 'https://itemB.com' });
  await reevaluateTab(50, 'https://itemB.com', items);

  // itemA should be released, itemB should be claimed
  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['itemA'], undefined, 'itemA claim should be released');
  assert.equal(claims['itemB'], 50, 'itemB should gain the claim');

  const states = buildLiveStates(items);
  assert.equal(states['itemA'].live, false, 'itemA should no longer be live');
  assert.equal(states['itemB'].live, true, 'itemB should now be live');
});

test('AC6: tab URL change to non-matching URL releases claim with no new assignment', async () => {
  __setMockTabs([
    { id: 60, url: 'https://saved.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'saved-item', url: 'https://saved.com', sortOrder: 0 },
  ];

  await reconcileClaims(items);
  let claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['saved-item'], 60);

  // Navigate to a URL that matches no saved item
  updateTabEntry(60, { url: 'https://unrelated.com' });
  await reevaluateTab(60, 'https://unrelated.com', items);

  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['saved-item'], undefined, 'Claim should be released');
  assert.equal(Object.keys(claims).length, 0, 'No claims should remain');
});
