/**
 * b189-live-tab-descriptor.test.js — B-189 (Sprint 48, Tier-A A2)
 *
 * Authoritative spec: docs/design/77-display-order-consolidation-r0-spike.md
 * §77.6.2 (the "cheap, safe" unify win) + §77.6.1 (the KEEP-SEPARATE boundary).
 *
 * B-189 unifies the live-tab DESCRIPTOR projection + the claimed-tabId
 * classifier atom shared by `buildOpenTabs` and `buildFloatingMembers`, WITHOUT
 * merging the two data/persistence/ordering models. This is a PURE REFACTOR —
 * zero behavior change. These tests are the anti-drift net for that guarantee:
 *
 *   1. The shared `liveTabDescriptor` projection produces the 8 common fields
 *      with the canonical fallbacks (empty title/url → '', empty favIconUrl →
 *      null, missing index → 0, truthy-coercion of audible/active).
 *   2. `buildOpenTabs` emits the shared base VERBATIM (no floating-only fields).
 *   3. `buildFloatingMembers` emits the shared base EXTENDED with parentItemId
 *      (+ optional sortOrder / floatingTabId) — and its 8 common fields are
 *      byte-identical to the buildOpenTabs projection for the same live entry.
 *      This is the guarantee that the two surfaces cannot silently drift.
 *   4. Source-text anti-drift pin: both build passes source the descriptor from
 *      the single shared helper; the old inline object-literal projections must
 *      not reappear.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { __resetMock, __setMockTabs, seedPartitions } from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, reconcileClaims } from '../background/tabs/tab-claims.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import { buildFloatingMembers } from '../background/tabs/floating-members.js';
import { liveTabDescriptor } from '../background/tabs/live-tab-descriptor.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');
const readFile = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const COMMON_FIELDS = [
  'tabId', 'windowId', 'title', 'url', 'favIconUrl', 'audible', 'active', 'tabIndex',
];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('B-189 §77.6.2: liveTabDescriptor projects the 8 common fields with the canonical fallbacks', () => {
  const full = liveTabDescriptor(7, {
    windowId: 3, title: 'Hello', url: 'https://ex/', favIconUrl: 'https://ex/f.ico',
    audible: true, active: true, index: 4,
  });
  assert.deepStrictEqual(full, {
    tabId: 7, windowId: 3, title: 'Hello', url: 'https://ex/',
    favIconUrl: 'https://ex/f.ico', audible: true, active: true, tabIndex: 4,
  });

  /* Fallbacks — mirror the pre-refactor inline projections exactly:
     empty title/url → '', empty-string favIconUrl → null, missing index → 0,
     truthy-coercion of audible/active. */
  const empty = liveTabDescriptor(9, { windowId: 1, favIconUrl: '' });
  assert.deepStrictEqual(empty, {
    tabId: 9, windowId: 1, title: '', url: '',
    favIconUrl: null, audible: false, active: false, tabIndex: 0,
  });
});

test('B-189 §77.6.2: buildOpenTabs descriptor equals the shared base VERBATIM (no floating extension)', async () => {
  __setMockTabs([
    { id: 42, url: 'https://open.example/', title: 'Open', windowId: 2,
      active: true, audible: false, index: 3, favIconUrl: 'https://open.example/f.ico' },
  ]);
  await buildLiveTabIndex();
  /* Flip claimsReady (buildOpenTabs returns [] until reconcile runs). No items
     → nothing claimed → the tab qualifies as an Open Tab. */
  await reconcileClaims([]);

  const openTabs = buildOpenTabs();
  assert.equal(openTabs.length, 1, 'the single unclaimed tab is an Open Tab');
  const entry = getLiveTabIndex().get(42);
  assert.deepStrictEqual(
    openTabs[0], liveTabDescriptor(42, entry),
    'open-tab descriptor is the shared LiveTabDescriptor base, verbatim',
  );
  /* No floating-only fields ever leak onto an open-tab descriptor. */
  assert.ok(!('parentItemId' in openTabs[0]), 'open-tab must not carry parentItemId');
  assert.ok(!('sortOrder' in openTabs[0]), 'open-tab must not carry sortOrder');
  assert.ok(!('floatingTabId' in openTabs[0]), 'open-tab must not carry floatingTabId');
});

test('B-189 §77.6.2: buildFloatingMembers descriptor = shared base + parentItemId (+ sortOrder/floatingTabId); common fields identical to the open-tab projection', async () => {
  seedPartitions({
    items: [
      { id: 'p-a', title: 'Parent A', url: 'https://parent-a/', groupId: 'g-A',
        sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
    groups: [
      { id: 'g-A', name: 'A', color: 'red', parentId: null, sortOrder: 0,
        collapsed: false, createdAt: 1, updatedAt: 1 },
    ],
    floatingGroups: [
      { floatingTabId: 'ft-a', groupId: 'g-A', parentItemId: 'p-a', windowId: 1,
        tabIndex: 0, url: 'https://child-a/', savedAt: 1000, liveTabId: 100, sortOrder: 5 },
    ],
  });
  __setMockTabs([
    { id: 100, url: 'https://child-a/', title: 'CHILD-A', windowId: 1,
      active: true, audible: true, index: 7, favIconUrl: 'https://child-a/f.ico' },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]); // claimsReady; no saved-item claims

  const members = await buildFloatingMembers([{ id: 'p-a', groupId: 'g-A' }]);
  assert.ok(members['g-A'] && members['g-A'].length === 1, 'g-A floating bucket populated');
  const desc = members['g-A'][0];

  const entry = getLiveTabIndex().get(100);
  const base = liveTabDescriptor(100, entry);

  /* The 8 common fields are byte-identical to the shared base (== the exact
     projection buildOpenTabs emits) — the two surfaces cannot drift. */
  for (const f of COMMON_FIELDS) {
    assert.deepStrictEqual(desc[f], base[f], `common field "${f}" must match the shared base`);
  }
  /* Floating EXTENDS the base with its per-type fields (all preserved). */
  assert.equal(desc.parentItemId, 'p-a', 'floating descriptor carries parentItemId');
  assert.equal(desc.sortOrder, 5, 'floating descriptor propagates record.sortOrder when present');
  assert.equal(desc.floatingTabId, 'ft-a', 'floating descriptor propagates record.floatingTabId when present');
});

test('B-189 §77.6.2: both classifier build passes source the descriptor from the SINGLE shared projection (anti-drift pin)', () => {
  const openSrc = readFile('background/tabs/open-tabs.js');
  const floatSrc = readFile('background/tabs/floating-members.js');

  assert.match(
    openSrc,
    /import\s*\{[^}]*liveTabDescriptor[^}]*\}\s*from\s*'\.\/live-tab-descriptor\.js'/,
    'open-tabs.js must import liveTabDescriptor',
  );
  assert.match(openSrc, /liveTabDescriptor\(tabId,\s*entry\)/, 'open-tabs.js must project via liveTabDescriptor');
  assert.match(
    floatSrc,
    /import\s*\{[^}]*liveTabDescriptor[^}]*\}\s*from\s*'\.\/live-tab-descriptor\.js'/,
    'floating-members.js must import liveTabDescriptor',
  );
  assert.match(floatSrc, /liveTabDescriptor\(matchedTabId,\s*liveEntry\)/, 'floating-members.js must project via liveTabDescriptor');

  /* The pre-refactor inline object-literal projections must NOT reappear in
     either build pass (that would re-open the silent-drift surface). */
  assert.doesNotMatch(openSrc, /favIconUrl:\s*entry\.favIconUrl\s*\?/, 'open-tabs.js must not re-inline the favicon projection');
  assert.doesNotMatch(floatSrc, /favIconUrl:\s*liveEntry\.favIconUrl\s*\?/, 'floating-members.js must not re-inline the favicon projection');

  /* Both passes must derive the claimed-tabId set from the shared classifier
     atom, not the inline `new Set(Object.values(...))`. */
  assert.match(openSrc, /getClaimedTabIds\(\)/, 'open-tabs.js must use getClaimedTabIds()');
  assert.match(floatSrc, /getClaimedTabIds\(\)/, 'floating-members.js must use getClaimedTabIds()');
});
