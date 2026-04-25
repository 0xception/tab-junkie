/**
 * b096-import-validator-sync.test.js — B-096 (Sprint 32, Fast Track XS).
 *
 * Verifies that `shared/theme-slugs.js` exports frozen canonical constants and
 * that `validatePreferences` inside `json-validator.js` uses the shared READ
 * set (all 15 values accepted; unknown slugs rejected).
 *
 * AC coverage:
 *   AC1 — shared/theme-slugs.js exports VALID_THEME_SLUGS_WRITE (13 slugs)
 *   AC2 — shared/theme-slugs.js exports VALID_THEME_SLUGS_READ (15 values, Set)
 *   AC3 — json-validator.js validatePreferences accepts all 15 READ-set values
 *          (13 canonical + legacy 'light' + legacy 'dark')
 *   AC4 — json-validator.js validatePreferences rejects unknown slug
 *   AC5 — VALID_THEME_SLUGS_WRITE is frozen (immutability invariant)
 *   AC6 — VALID_THEME_SLUGS_READ is frozen (immutability invariant)
 *   AC7 — missing/undefined theme passes through (optional field per §32.5.4)
 *   AC8 — null theme is rejected (must be string when present)
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';

import {
  VALID_THEME_SLUGS_WRITE,
  VALID_THEME_SLUGS_READ,
} from '../shared/theme-slugs.js';
import { parseAndValidate } from '../background/import/json-validator.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
});

/* =========================================================================
 * Helpers
 * ========================================================================= */

function backupWithPrefs(prefsOverride) {
  return JSON.stringify({
    schemaVersion: KNOWN_VERSION,
    exportedAt: '2026-04-23T00:00:00.000Z',
    items: [],
    groups: [],
    preferences: prefsOverride,
  });
}

/* =========================================================================
 * AC1 — VALID_THEME_SLUGS_WRITE shape
 * ========================================================================= */

test('B-096 AC1: VALID_THEME_SLUGS_WRITE is an Array of 14 slugs (incl. tokyo-night from B-098)', () => {
  assert.ok(Array.isArray(VALID_THEME_SLUGS_WRITE), 'VALID_THEME_SLUGS_WRITE must be an Array');
  assert.equal(VALID_THEME_SLUGS_WRITE.length, 14, 'must have exactly 14 write-side slugs');
  assert.ok(VALID_THEME_SLUGS_WRITE.includes('system'), 'must include system');
  assert.ok(VALID_THEME_SLUGS_WRITE.includes('dracula'), 'must include dracula');
  assert.ok(VALID_THEME_SLUGS_WRITE.includes('monokai'), 'must include monokai');
  assert.ok(VALID_THEME_SLUGS_WRITE.includes('tokyo-night'), 'must include tokyo-night');
});

/* =========================================================================
 * AC2 — VALID_THEME_SLUGS_READ shape
 * ========================================================================= */

test('B-096 AC2: VALID_THEME_SLUGS_READ is a Set of 16 values (14 write + 2 legacy, incl. tokyo-night from B-098)', () => {
  assert.ok(VALID_THEME_SLUGS_READ instanceof Set, 'VALID_THEME_SLUGS_READ must be a Set');
  assert.equal(VALID_THEME_SLUGS_READ.size, 16, 'must have 16 values (14 write + 2 legacy)');
  assert.ok(VALID_THEME_SLUGS_READ.has('light'), 'must include legacy alias `light`');
  assert.ok(VALID_THEME_SLUGS_READ.has('dark'), 'must include legacy alias `dark`');
  assert.ok(VALID_THEME_SLUGS_READ.has('tokyo-night'), 'must include tokyo-night');
});

/* =========================================================================
 * AC5 — VALID_THEME_SLUGS_WRITE is frozen
 * ========================================================================= */

test('B-096 AC5: VALID_THEME_SLUGS_WRITE is Object.frozen (immutable)', () => {
  assert.ok(Object.isFrozen(VALID_THEME_SLUGS_WRITE), 'VALID_THEME_SLUGS_WRITE must be frozen');
});

/* =========================================================================
 * AC6 — VALID_THEME_SLUGS_READ is frozen
 * ========================================================================= */

test('B-096 AC6: VALID_THEME_SLUGS_READ is Object.frozen (immutable)', () => {
  assert.ok(Object.isFrozen(VALID_THEME_SLUGS_READ), 'VALID_THEME_SLUGS_READ must be frozen');
});

/* =========================================================================
 * AC3 — json-validator validatePreferences accepts all 15 READ-set values
 * ========================================================================= */

test('B-096 AC3: validatePreferences accepts every WRITE-side slug in an import', () => {
  for (const slug of VALID_THEME_SLUGS_WRITE) {
    const result = parseAndValidate(backupWithPrefs({ theme: slug }));
    assert.ok(result.preferences, `slug '${slug}' should produce preferences`);
    assert.equal(result.preferences.theme, slug,
      `slug '${slug}' must pass through validatePreferences unchanged`);
  }
});

test('B-096 AC3: validatePreferences accepts legacy `light` (READ set — backup-restore symmetry)', () => {
  const result = parseAndValidate(backupWithPrefs({ theme: 'light' }));
  assert.ok(result.preferences, 'legacy `light` must be accepted by validatePreferences');
  assert.equal(result.preferences.theme, 'light');
});

test('B-096 AC3: validatePreferences accepts legacy `dark` (READ set — backup-restore symmetry)', () => {
  const result = parseAndValidate(backupWithPrefs({ theme: 'dark' }));
  assert.ok(result.preferences, 'legacy `dark` must be accepted by validatePreferences');
  assert.equal(result.preferences.theme, 'dark');
});

/* =========================================================================
 * AC4 — unknown slug is rejected
 * ========================================================================= */

test('B-096 AC4: validatePreferences rejects unknown theme slug → preferencesSkipped', () => {
  const result = parseAndValidate(backupWithPrefs({ theme: 'mystery-theme' }));
  assert.equal(result.preferences, undefined,
    'unknown slug must cause validatePreferences to return null → preferencesSkipped');
  assert.ok(result.repairs.preferencesSkipped, 'repairs.preferencesSkipped must be true for unknown slug');
});

/* =========================================================================
 * AC7 — missing/undefined theme passes (optional field)
 * ========================================================================= */

test('B-096 AC7: validatePreferences accepts preferences with no theme field (optional)', () => {
  const result = parseAndValidate(backupWithPrefs({ displayMode: 'sidepanel' }));
  assert.ok(result.preferences, 'preferences with no theme field must be accepted');
  assert.equal(result.preferences.displayMode, 'sidepanel');
});

/* =========================================================================
 * AC8 — null theme is rejected when present
 * ========================================================================= */

test('B-096 AC8: validatePreferences rejects null theme → preferencesSkipped', () => {
  const result = parseAndValidate(backupWithPrefs({ theme: null }));
  assert.equal(result.preferences, undefined,
    'null theme must cause validatePreferences to return null → preferencesSkipped');
  assert.ok(result.repairs.preferencesSkipped, 'repairs.preferencesSkipped must be true for null theme');
});
