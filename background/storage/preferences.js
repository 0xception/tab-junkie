/**
 * Preferences CRUD. Reads always merge defaults so callers see a fully
 * populated Preferences object even if the on-disk shape is from an older
 * schema version. Writes merge-patch on top of the current stored value.
 */

import { StorageError, ERR_VALIDATION } from './errors.js';
import {
  PARTITION_PREFS,
  DEFAULT_PREFERENCES,
  readPartition,
} from './partitions.js';
import { writeTransaction } from './write-transaction.js';
import { VALID_THEME_SLUGS_WRITE } from '../../shared/theme-slugs.js';

function validatePrefsPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'setPreferences: patch required');
  }
  const allowed = Object.keys(DEFAULT_PREFERENCES);
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) {
      throw new StorageError(ERR_VALIDATION, `setPreferences: unknown field "${k}"`);
    }
  }
  if ('theme' in patch && !VALID_THEME_SLUGS_WRITE.includes(patch.theme)) {
    throw new StorageError(ERR_VALIDATION, `setPreferences: theme must be one of ${VALID_THEME_SLUGS_WRITE.join('|')}`);
  }
  if ('displayMode' in patch && !['sidepanel', 'window'].includes(patch.displayMode)) {
    throw new StorageError(ERR_VALIDATION, 'setPreferences: displayMode must be sidepanel|window');
  }
  if ('autoCollapseSubGroups' in patch && typeof patch.autoCollapseSubGroups !== 'boolean') {
    throw new StorageError(ERR_VALIDATION, 'setPreferences: autoCollapseSubGroups must be boolean');
  }
  /* B-060 — "Import duplicates anyway" checkbox toggle persists the user's
     last choice as a preference. Boolean-typed like the other flags. */
  if ('importSkipDuplicates' in patch && typeof patch.importSkipDuplicates !== 'boolean') {
    throw new StorageError(ERR_VALIDATION, 'setPreferences: importSkipDuplicates must be boolean');
  }
  /* B-092 — opt-in compact layout. Boolean-typed; rejected when not present
     in the allow-list above, so the type check here is sufficient. */
  if ('denseLayout' in patch && typeof patch.denseLayout !== 'boolean') {
    throw new StorageError(ERR_VALIDATION, 'setPreferences: denseLayout must be boolean');
  }
}

export async function getPreferences() {
  const stored = await readPartition(PARTITION_PREFS);
  /* B-037 §45.3 D-2 — read-time legacy theme normalisation. Runs AFTER
     `readPartition`/`assertShape` (which tolerates 'light'/'dark' via the
     read-side allow-list in shapes.js) and BEFORE the defaults-merge so the
     runtime contract sees only the 13-slug enum. We mutate a shallow copy
     here — the persisted disk value stays at its legacy string until the
     user picks a new theme, which keeps R6 rollback trivial. */
  if (stored && typeof stored === 'object') {
    if (stored.theme === 'light' || stored.theme === 'dark') {
      const migrated = { ...stored };
      migrated.theme = stored.theme === 'light' ? 'atom-one-light' : 'one-dark';
      return { ...DEFAULT_PREFERENCES, ...migrated };
    }
  }
  return { ...DEFAULT_PREFERENCES, ...stored };
}

/**
 * @param {Partial<import('./partitions.js').Preferences>} patch
 */
export async function setPreferences(patch) {
  validatePrefsPatch(patch);
  /** @type {import('./partitions.js').Preferences} */
  let next;
  await writeTransaction([
    {
      partition: PARTITION_PREFS,
      mutator: (current) => {
        next = { ...DEFAULT_PREFERENCES, ...current, ...patch };
        return next;
      },
    },
  ]);
  return next;
}
