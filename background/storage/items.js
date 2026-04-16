/**
 * Item CRUD. All writes go through `writeTransaction` (AC6). Reads use
 * `readPartition` which applies shape validation and default fallback.
 */

import {
  StorageError,
  ERR_NOT_FOUND,
  ERR_VALIDATION,
} from './errors.js';
import {
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  MAX_TITLE,
  MAX_URL,
  readPartition,
} from './partitions.js';
import { writeTransaction } from './write-transaction.js';
import { ulid } from './ids.js';

// H2: only schemes safe for downstream `<a href>` rendering are accepted at
// the storage boundary. Parsing with `new URL` both normalizes and rejects
// malformed input. `javascript:`, `data:`, `file:`, `chrome:` etc. are
// rejected here so stored XSS cannot originate from the storage layer.
const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'ftp:', 'mailto:']);

function assertValidUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    // M7: do not echo the raw input back in the message body; attach it as
    // structured `cause` so logs that serialize `.message` can't leak it.
    throw new StorageError(ERR_VALIDATION, 'url is not a valid URL', { url });
  }
  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new StorageError(ERR_VALIDATION, 'url scheme not allowed', { scheme: parsed.protocol });
  }
}

function validateNewItem(input) {
  if (!input || typeof input !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'createItem: payload required');
  }
  const { title, url, groupId } = input;
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new StorageError(ERR_VALIDATION, 'createItem: title must be a non-empty string');
  }
  if (title.length > MAX_TITLE) {
    throw new StorageError(ERR_VALIDATION, `createItem: title exceeds ${MAX_TITLE} chars`);
  }
  if (typeof url !== 'string' || url.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'createItem: url must be a non-empty string');
  }
  if (url.length > MAX_URL) {
    throw new StorageError(ERR_VALIDATION, `createItem: url exceeds ${MAX_URL} chars`);
  }
  assertValidUrl(url);
  if (groupId !== null && groupId !== undefined && typeof groupId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'createItem: groupId must be string or null');
  }
}

function validatePatch(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'updateItem: patch required');
  }
  if ('id' in patch || 'createdAt' in patch) {
    throw new StorageError(ERR_VALIDATION, 'updateItem: id and createdAt are immutable');
  }
  // M2: `updatedAt` is always overwritten by the mutator, so it must not be
  // in the caller-visible allowed patch list.
  const allowed = ['title', 'url', 'groupId', 'sortOrder'];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) {
      throw new StorageError(ERR_VALIDATION, 'updateItem: unknown field', { field: k });
    }
  }
  if ('title' in patch) {
    if (typeof patch.title !== 'string' || patch.title.trim().length === 0) {
      throw new StorageError(ERR_VALIDATION, 'updateItem: title must be non-empty string');
    }
    if (patch.title.length > MAX_TITLE) {
      throw new StorageError(ERR_VALIDATION, `updateItem: title exceeds ${MAX_TITLE} chars`);
    }
  }
  if ('url' in patch) {
    if (typeof patch.url !== 'string' || patch.url.length === 0) {
      throw new StorageError(ERR_VALIDATION, 'updateItem: url must be non-empty string');
    }
    if (patch.url.length > MAX_URL) {
      throw new StorageError(ERR_VALIDATION, `updateItem: url exceeds ${MAX_URL} chars`);
    }
    assertValidUrl(patch.url);
  }
  if ('groupId' in patch && patch.groupId !== null && typeof patch.groupId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'updateItem: groupId must be string or null');
  }
  if ('sortOrder' in patch && (typeof patch.sortOrder !== 'number' || !Number.isFinite(patch.sortOrder))) {
    throw new StorageError(ERR_VALIDATION, 'updateItem: sortOrder must be finite number');
  }
}

/**
 * C2: verify that a non-null groupId points at an existing group. Must be
 * called inside the same writeTransaction op that reads/writes the items
 * partition so the check and the mutation observe a consistent snapshot.
 * Null is always valid (Ungrouped).
 * @param {string|null|undefined} groupId
 * @param {import('./partitions.js').Group[]} groups
 */
function assertGroupExists(groupId, groups) {
  if (groupId === null || groupId === undefined) return;
  if (!groups.some((g) => g.id === groupId)) {
    throw new StorageError(ERR_NOT_FOUND, 'groupId does not exist', { groupId });
  }
}

/**
 * @param {{title: string, url: string, groupId: string|null}} input
 * @returns {Promise<import('./partitions.js').Item>}
 */
export async function createItem(input) {
  validateNewItem(input);
  const now = Date.now();
  const item = {
    id: ulid(),
    title: input.title,
    url: input.url,
    groupId: input.groupId ?? null,
    // Ruling #2: deterministic default of 0. Drag-reorder (B-030) will assign
    // explicit ordering values later; using Date.now() here made tests flaky
    // and had no semantic meaning vs. "unsorted".
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
  // C2: snapshot groups inside the tx (via a read-only mutator op) so the FK
  // check observes the same serialized state as the items write. Both ops
  // execute inside writeTransaction's single get → mutate → set cycle.
  let groupsSnapshot = [];
  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        groupsSnapshot = groups;
        return groups;
      },
    },
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        assertGroupExists(item.groupId, groupsSnapshot);
        return [...items, item];
      },
    },
  ]);
  return item;
}

/**
 * @param {string} id
 * @returns {Promise<import('./partitions.js').Item|null>}
 */
export async function getItem(id) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'getItem: id required');
  const items = await readPartition(PARTITION_ITEMS);
  return items.find((it) => it.id === id) ?? null;
}

/**
 * @param {string} id
 * @param {Partial<import('./partitions.js').Item>} patch
 */
export async function updateItem(id, patch) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'updateItem: id required');
  validatePatch(patch);
  let updated = null;
  let groupsSnapshot = [];
  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        groupsSnapshot = groups;
        return groups;
      },
    },
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) throw new StorageError(ERR_NOT_FOUND, 'Item not found', { id });
        // C2: FK check for groupId in the patch, inside the same tx.
        if ('groupId' in patch) {
          assertGroupExists(patch.groupId, groupsSnapshot);
        }
        const next = { ...items[idx], ...patch, id: items[idx].id, createdAt: items[idx].createdAt, updatedAt: Date.now() };
        updated = next;
        const out = items.slice();
        out[idx] = next;
        return out;
      },
    },
  ]);
  return updated;
}

/**
 * Delete an item by id. H6 / ruling #3: idempotent silent no-op — unknown
 * ids return `void` with no mutation and no error, matching the `getItem`
 * → `null` pattern and avoiding footguns for optimistic-delete callers.
 * @param {string} id
 */
export async function deleteItem(id) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'deleteItem: id required');
  await writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) return items; // idempotent no-op on unknown id
        const out = items.slice();
        out.splice(idx, 1);
        return out;
      },
    },
  ]);
}

/**
 * @param {{groupId?: string|null}} [filter]
 */
export async function listItems(filter) {
  const items = await readPartition(PARTITION_ITEMS);
  if (!filter) return items;
  if ('groupId' in filter) {
    return items.filter((it) => it.groupId === filter.groupId);
  }
  return items;
}
