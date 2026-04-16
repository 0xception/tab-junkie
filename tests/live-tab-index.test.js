import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs } from './chrome-mock.js';
import {
  buildLiveTabIndex,
  getLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
});

test('AC1: buildLiveTabIndex with 50 mock tabs produces Map with 50 entries', async () => {
  const tabs = [];
  for (let i = 1; i <= 50; i++) {
    tabs.push({ id: i, url: `https://example.com/page${i}`, windowId: 1, active: i === 1, audible: false });
  }
  __setMockTabs(tabs);

  await buildLiveTabIndex();
  const index = getLiveTabIndex();

  assert.equal(index.size, 50, 'Index should contain 50 entries');
  // Spot-check a couple entries
  const entry1 = index.get(1);
  assert.equal(entry1.url, 'https://example.com/page1');
  assert.equal(entry1.active, true);
  const entry50 = index.get(50);
  assert.equal(entry50.url, 'https://example.com/page50');
  assert.equal(entry50.active, false);
});

test('AC1: buildLiveTabIndex completes in under 100ms for 50 tabs', async () => {
  const tabs = [];
  for (let i = 1; i <= 50; i++) {
    tabs.push({ id: i, url: `https://example.com/page${i}`, windowId: 1, active: false, audible: false });
  }
  __setMockTabs(tabs);

  const start = performance.now();
  await buildLiveTabIndex();
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 100, `buildLiveTabIndex took ${elapsed.toFixed(2)}ms, should be < 100ms`);
});

test('AC1: buildLiveTabIndex stores url, windowId, active, audible per tab', async () => {
  __setMockTabs([
    { id: 10, url: 'https://example.com', windowId: 3, active: true, audible: true },
  ]);

  await buildLiveTabIndex();
  const entry = getLiveTabIndex().get(10);

  assert.deepStrictEqual(entry, {
    url: 'https://example.com',
    windowId: 3,
    active: true,
    audible: true,
    index: 0,
    favIconUrl: '',
  });
});

test('AC1: buildLiveTabIndex clears previous entries on rebuild', async () => {
  __setMockTabs([{ id: 1, url: 'https://a.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  assert.equal(getLiveTabIndex().size, 1);

  __setMockTabs([{ id: 2, url: 'https://b.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  assert.equal(getLiveTabIndex().size, 1);
  assert.equal(getLiveTabIndex().has(1), false, 'Old tab should be cleared');
  assert.equal(getLiveTabIndex().has(2), true);
});
