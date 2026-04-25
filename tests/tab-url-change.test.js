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

/* B-099 §46.3 D-1 / D-3 (Sprint 33) — these two tests previously asserted the
   pre-B-099 behavior where `reevaluateTab` released a claim on URL mismatch
   AND, for a navigation to another saved item's URL, re-assigned the claim
   to that item. Both behaviors are explicitly reversed under Option B:
     - D-1: claim is PRESERVED across URL changes (drift, not orphan).
     - D-3: original-claim-wins; the new matching item does NOT auto-claim
       a tab that is still claimed by another item.
   The two replacements below are the regression guards for the new contract
   and live alongside the eight new B-099 tests in `tests/b099-drift-fix.test.js`. */

test('B-099 D-1: tab URL change preserves the original claim (no release on mismatch)', async () => {
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

  // Simulate tab navigating to itemB's URL — under B-099 D-1 the claim on
  // itemA is PRESERVED, and under D-3 itemB does NOT auto-claim because the
  // tab is still claimed.
  updateTabEntry(50, { url: 'https://itemB.com' });
  await reevaluateTab(50, 'https://itemB.com', items);

  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['itemA'], 50, 'itemA claim should be preserved across URL change (D-1)');
  assert.equal(claims['itemB'], undefined, 'itemB must not auto-claim a tab another item already holds (D-3)');

  const states = buildLiveStates(items);
  assert.equal(states['itemA'].live, true, 'itemA remains live (claim preserved)');
  assert.equal(states['itemB'].live, false, 'itemB is not live (no claim assigned)');
});

test('B-099 D-1: tab navigation to an unrelated URL preserves the existing claim', async () => {
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

  // Navigate to a URL that matches no saved item — the bookmark↔tab
  // association still holds (drift territory), the claim is NOT released.
  updateTabEntry(60, { url: 'https://unrelated.com' });
  await reevaluateTab(60, 'https://unrelated.com', items);

  claims = __getSessionStore('tj:tabClaims');
  assert.equal(claims['saved-item'], 60, 'Claim should be preserved on URL mismatch (D-1)');
  assert.equal(Object.keys(claims).length, 1, 'Exactly one claim should remain (the original)');
});
