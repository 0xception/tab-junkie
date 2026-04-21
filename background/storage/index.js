/**
 * Public storage API barrel. Consumed only by `background/messages/*` and
 * future SW-side modules. UI surfaces MUST NOT import this file directly —
 * enforced statically by ESLint `no-restricted-imports` (see `.eslintrc.json`)
 * and defensively at runtime by the storage-handlers dispatcher.
 */

export {
  createItem,
  getItem,
  updateItem,
  deleteItem,
  listItems,
  bulkCreateItems,
  bulkDeleteItems,
  bulkUpdateItems,
  bulkReorderItems,
} from './items.js';

export {
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  listGroups,
} from './groups.js';

export {
  getPreferences,
  setPreferences,
} from './preferences.js';

// M3: `writeTransaction` is an internal implementation detail of the storage
// module. No caller outside `background/storage/` has a legitimate reason to
// import it, so it's not re-exported from this barrel.
export { ulid } from './ids.js';
export {
  StorageError,
  ERR_NOT_READY,
  ERR_NOT_FOUND,
  ERR_DEPTH_EXCEEDED,
  ERR_CIRCULAR_REF,
  ERR_DIRECT_WRITE,
  ERR_CORRUPT_DATA,
  ERR_ID_COLLISION,
  ERR_QUOTA_EXCEEDED,
  ERR_VALIDATION,
  ERR_TX_CONFLICT,
  ERR_SAFE_MODE,
  ERR_DUPLICATE_URL,
} from './errors.js';
export {
  initializePartitions,
  ALL_PARTITIONS,
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  PARTITION_META,
  PARTITION_DRIFT,
  PARTITION_FLOATING_GROUPS,
} from './partitions.js';
export { KNOWN_VERSION, getSystemStatus } from './migration.js';
