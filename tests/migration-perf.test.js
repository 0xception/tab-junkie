/**
 * B-001b AC9: Migration performance — 1000 items + 100 groups, runMigrations < 500ms.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';
import {
  runMigrations,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC9: runMigrations with 1000 items + 100 groups completes in < 500ms', async () => {
  const now = Date.now();

  // Generate 1000 items
  const items = [];
  for (let i = 0; i < 1000; i++) {
    items.push({
      id: `ITEM${String(i).padStart(4, '0')}`,
      title: `Item ${i}`,
      url: `https://example.com/page/${i}`,
      groupId: null,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Generate 100 groups
  const groups = [];
  for (let i = 0; i < 100; i++) {
    groups.push({
      id: `GROUP${String(i).padStart(3, '0')}`,
      name: `Group ${i}`,
      color: '#ff0000',
      parentId: null,
      sortOrder: i,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  seedPartitions({
    meta: { schemaVersion: KNOWN_VERSION, createdAt: now },
    items,
    groups,
    prefs: { theme: 'system', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: false },
    drift: {},
    floatingGroups: [],
  });

  const start = performance.now();
  await runMigrations();
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 500, `runMigrations took ${elapsed.toFixed(1)}ms — expected < 500ms`);
});
