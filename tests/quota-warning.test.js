/**
 * B-001b AC6: Quota warning — getBytesInUse at 80% → quotaWarning:true, 79% → false.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions, __setBytesInUse } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

const QUOTA_BYTES = 5242880; // 5 MiB

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC6: getBytesInUse at 80% → quotaWarning is true', async () => {
  const eightyPercent = Math.ceil(QUOTA_BYTES * 0.80);
  __setBytesInUse(eightyPercent);
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.quotaWarning, true);
  assert.equal(status.quotaBytesInUse, eightyPercent);
  assert.equal(status.quotaBytesTotal, QUOTA_BYTES);
});

test('AC6: getBytesInUse at 79% → quotaWarning is false', async () => {
  const seventyNinePercent = Math.floor(QUOTA_BYTES * 0.79);
  __setBytesInUse(seventyNinePercent);
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.quotaWarning, false);
  assert.equal(status.quotaBytesInUse, seventyNinePercent);
});

test('AC6: getBytesInUse at exactly 80% threshold → quotaWarning is true', async () => {
  const exactThreshold = QUOTA_BYTES * 0.80;
  __setBytesInUse(exactThreshold);
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.quotaWarning, true);
});

test('AC6: getBytesInUse at 0 → quotaWarning is false', async () => {
  __setBytesInUse(0);
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.quotaWarning, false);
});
