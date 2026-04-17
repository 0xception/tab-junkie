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
import { MAX_BULK_INPUTS } from './shapes.js';
import { writeTransaction } from './write-transaction.js';
import { ulid } from './ids.js';
import { normalizeUrl } from '../../shared/url.js';

/**
 * Validate createItem input. Returns the normalized URL (B-002: protocol
 * defaulting + scheme validation + hostname lowercasing happen here).
 * @returns {string} normalized URL for storage
 */
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
  // B-002: normalize first (protocol defaulting may add chars), then length cap
  const normalized = normalizeUrl(url, { forStorage: true });
  if (normalized.length > MAX_URL) {
    throw new StorageError(ERR_VALIDATION, `createItem: url exceeds ${MAX_URL} chars`);
  }
  if (groupId !== null && groupId !== undefined && typeof groupId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'createItem: groupId must be string or null');
  }
  return normalized;
}

/**
 * Validate updateItem patch. If the patch contains a `url` field, it is
 * normalized in place (B-002). Returns void — the patch object is mutated.
 */
function validatePatch(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'updateItem: patch required');
  }
  if ('id' in patch || 'createdAt' in patch) {
    throw new StorageError(ERR_VALIDATION, 'updateItem: id and createdAt are immutable');
  }
  // M2: `updatedAt` is always overwritten by the mutator, so it must not be
  // in the caller-visible allowed patch list.
  const allowed = ['title', 'url', 'groupId', 'sortOrder', 'lastAccessedAt'];
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
    // B-002: normalize first (protocol defaulting may add chars), then length cap
    patch.url = normalizeUrl(patch.url, { forStorage: true });
    if (patch.url.length > MAX_URL) {
      throw new StorageError(ERR_VALIDATION, `updateItem: url exceeds ${MAX_URL} chars`);
    }
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
  const normalizedUrl = validateNewItem(input);
  const now = Date.now();
  const item = {
    id: ulid(),
    title: input.title,
    url: normalizedUrl,
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
 * Bulk-create saved items with partial-success semantics.
 * Validates each input independently; writes all passing items in a
 * single writeTransaction (one storage.get + one storage.set).
 *
 * @param {Array<{title: string, url: string, groupId?: string|null}>} inputs
 * @returns {Promise<{created: import('./partitions.js').Item[], skipped: {input: Object, reason: string}[]}>}
 */
export async function bulkCreateItems(inputs) {
  // H-4: non-array → return partial-success envelope (no-op, no throw)
  if (!Array.isArray(inputs)) {
    return { created: [], skipped: [] };
  }
  if (inputs.length === 0) {
    return { created: [], skipped: [] };
  }
  // H-2: upper bound on inputs to prevent quota-exhaustion
  if (inputs.length > MAX_BULK_INPUTS) {
    throw new StorageError(ERR_VALIDATION, `bulkCreateItems: inputs array exceeds maximum of ${MAX_BULK_INPUTS}`);
  }

  const now = Date.now();
  const candidates = [];
  const skipped = [];

  // Phase 1: pre-validate outside transaction (title/url format, length)
  for (const input of inputs) {
    try {
      const normalizedUrl = validateNewItem(input);
      candidates.push({
        item: {
          id: ulid(),
          title: input.title,
          url: normalizedUrl,
          groupId: input.groupId ?? null,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        },
        originalInput: input,
      });
    } catch (err) {
      skipped.push({ input, reason: err.message });
    }
  }

  if (candidates.length === 0) {
    return { created: [], skipped };
  }

  // Phase 2: single writeTransaction (groups read + items append)
  // H-1/H-3: collect results inside mutator into local vars; only merge into
  // outer arrays after writeTransaction resolves successfully. This prevents
  // phantom entries in `created` if the transaction throws (e.g. quota exceeded
  // or assertShape failure).
  let groupsSnapshot = [];
  const created = [];

  let txCreated = [];
  let txGroupSkipped = [];

  try {
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
          txCreated = [];
          txGroupSkipped = [];
          const toAppend = [];
          for (const { item, originalInput } of candidates) {
            try {
              assertGroupExists(item.groupId, groupsSnapshot);
              // Strip _originalInput from stored shape if ever present
              toAppend.push(item);
              txCreated.push(item);
            } catch (err) {
              txGroupSkipped.push({ input: originalInput, reason: err.message });
            }
          }
          return [...items, ...toAppend];
        },
      },
    ]);
    // Transaction succeeded — safe to surface results
    created.push(...txCreated);
    skipped.push(...txGroupSkipped);
  } catch (err) {
    // Transaction failed — all validated candidates are effectively skipped
    for (const { originalInput } of candidates) {
      skipped.push({ input: originalInput, reason: err.message });
    }
  }

  return { created, skipped };
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
