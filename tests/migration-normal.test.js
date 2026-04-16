/**
 * B-001b AC1: Normal startup — schemaVersion matches KNOWN_VERSION, no steps run.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  isSafeMode,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC1: schemaVersion equals KNOWN_VERSION — runMigrations resolves, no steps ran', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations(); // should not throw

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION);
  assert.equal(status.safeMode, false);
  assert.equal(isSafeMode(), false);
});

test('AC1: status shape has all expected fields after normal startup', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  await runMigrations();

  const status = getSystemStatus();
  assert.equal(typeof status.safeMode, 'boolean');
  assert.equal(typeof status.schemaVersion, 'number');
  assert.equal(typeof status.knownVersion, 'number');
  assert.equal(typeof status.quotaWarning, 'boolean');
  assert.equal(typeof status.quotaBytesInUse, 'number');
  assert.equal(typeof status.quotaBytesTotal, 'number');
  assert.equal(status.knownVersion, KNOWN_VERSION);
});
