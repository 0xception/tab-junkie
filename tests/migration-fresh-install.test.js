/**
 * B-001b AC2: Fresh install — empty storage, initializePartitions seeds v1, resolves cleanly.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { defaultShape, PARTITION_META } from '../background/storage/shapes.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC2: empty storage — runMigrations seeds partitions and resolves', async () => {
  // Storage is completely empty — fresh install scenario
  await runMigrations();

  const meta = __getRawStore('tj:meta');
  assert.ok(meta, 'tj:meta should be seeded');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);

  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items), 'tj:items should be seeded as array');

  const groups = __getRawStore('tj:groups');
  assert.ok(Array.isArray(groups), 'tj:groups should be seeded as array');

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION);
  assert.equal(status.safeMode, false);
});

/*
 * B-137 R5 LOW L-3 — defaultShape paired-bump hardening.
 *
 * The C-1a paired-bump invariant requires `defaultShape(PARTITION_META).schemaVersion`
 * to advance LOCK-STEP with `KNOWN_VERSION`. The other tests in this file
 * assert `meta.schemaVersion === KNOWN_VERSION` (via constant) — that catches
 * a desync at the call-site. This literal pin catches a manual edit that
 * reverts the defaultShape value alone (e.g., a refactor that re-exports
 * defaultShape from a stale module). The literal value MUST be updated
 * by hand whenever KNOWN_VERSION bumps; this test forces the invariant
 * into a CI-visible failure if the two drift.
 */
test('B-137 R5 L-3: defaultShape(PARTITION_META).schemaVersion === 8 (B-167 §73.3.1 paired-bump invariant)', () => {
  const shape = defaultShape(PARTITION_META);
  assert.equal(shape.schemaVersion, 8,
    'defaultShape(PARTITION_META).schemaVersion must be the literal 8 — bump this when KNOWN_VERSION bumps');
  assert.equal(shape.schemaVersion, KNOWN_VERSION,
    'defaultShape literal must equal KNOWN_VERSION (paired-bump invariant)');
});
