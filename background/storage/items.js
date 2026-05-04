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
  const allowed = ['title', 'url', 'groupId', 'sortOrder', 'lastAccessedAt', 'favIconUrl'];
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
  /* B-159 §A (S43, v6) — OPTIONAL favIconUrl. null clears (e.g., reset);
     non-empty string accepted (capture path gates via isSafeFaviconUrl
     before calling updateItem, so any persisted URL is https/http/data:image).
     Empty-string would be ambiguous vs "never observed" so we reject it. */
  if ('favIconUrl' in patch
    && patch.favIconUrl !== null
    && (typeof patch.favIconUrl !== 'string' || patch.favIconUrl.length === 0)) {
    throw new StorageError(ERR_VALIDATION, 'updateItem: favIconUrl must be non-empty string or null');
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
 * B-051: Normalise sort orders within a single group so they are sequential
 * integers starting at 0 with no gaps or duplicates.
 *
 * Input: a full items array and the groupId bucket to normalise (null = ungrouped).
 * Output: a new items array with sortOrder mutations applied in-place.
 *         If the bucket is already sequential, the original array is returned
 *         unchanged (idempotency fast-path — no unnecessary writes).
 *
 * Rules:
 * - Items are sorted by their current sortOrder before renumbering so relative
 *   order is preserved.
 * - Items not in the target groupId are passed through unmodified.
 * - An already-sequential bucket (0, 1, 2, …) produces zero mutations.
 *
 * @param {string|null} groupId
 * @param {import('./partitions.js').Item[]} items
 * @returns {import('./partitions.js').Item[]}
 */
function normaliseGroupSortOrders(groupId, items) {
  // Collect items in this bucket, preserving their indices in the original array.
  const bucketEntries = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].groupId === groupId) {
      bucketEntries.push({ idx: i, item: items[i] });
    }
  }

  if (bucketEntries.length === 0) return items;

  // Sort by current sortOrder to preserve relative order.
  bucketEntries.sort((a, b) => a.item.sortOrder - b.item.sortOrder);

  // Idempotency check: are values already 0, 1, 2, … ?
  const alreadyNormalised = bucketEntries.every((e, pos) => e.item.sortOrder === pos);
  if (alreadyNormalised) return items;

  // Apply sequential renumbering.
  const out = items.slice();
  for (let pos = 0; pos < bucketEntries.length; pos++) {
    const { idx, item } = bucketEntries[pos];
    if (item.sortOrder !== pos) {
      out[idx] = { ...item, sortOrder: pos };
    }
  }
  return out;
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
        /* B-148 §3.5 (S44, v6→v7) — append `item:<newId>` to target Group's
           renderOrder. Skips when groupId is null (Ungrouped items don't
           belong to any group). The append-at-end policy matches existing
           Item.sortOrder normalisation: createItem appends to the bucket. */
        if (item.groupId === null) return groups;
        const idx = groups.findIndex((g) => g.id === item.groupId);
        if (idx < 0) return groups; /* defensive — assertGroupExists in items mutator throws if missing */
        const g = groups[idx];
        const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
        renderOrder.push('item:' + item.id);
        const next = [...groups];
        next[idx] = { ...g, renderOrder, updatedAt: Date.now() };
        return next;
      },
    },
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        assertGroupExists(item.groupId, groupsSnapshot);
        // B-051 AC1/AC2: assign sortOrder = current bucket size so the new item
        // appends at the end, then normalise to close any pre-existing gaps.
        const bucketSize = items.filter((it) => it.groupId === item.groupId).length;
        const itemWithOrder = { ...item, sortOrder: bucketSize };
        const appended = [...items, itemWithOrder];
        const normalised = normaliseGroupSortOrders(item.groupId, appended);
        // Update item's sortOrder to reflect what was actually persisted.
        const persisted = normalised.find((it) => it.id === item.id);
        if (persisted) item.sortOrder = persisted.sortOrder;
        return normalised;
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
  // B-148 §3.5 — closure carries prevGroupId + groupChanged from items mutator
  // to groups mutator. ops are ordered ITEMS-then-GROUPS so items runs first
  // and sets these before the groups mutator executes.
  let prevGroupId = undefined;
  let groupChanged = false;
  await writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) throw new StorageError(ERR_NOT_FOUND, 'Item not found', { id });
        prevGroupId = items[idx].groupId;
        if ('groupId' in patch && patch.groupId !== prevGroupId) {
          groupChanged = true;
        }
        const next = { ...items[idx], ...patch, id: items[idx].id, createdAt: items[idx].createdAt, updatedAt: Date.now() };
        updated = next;
        const out = items.slice();
        out[idx] = next;
        return out;
      },
    },
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        // C2: FK check for groupId in the patch (groups mutator has direct access).
        if ('groupId' in patch) {
          assertGroupExists(patch.groupId, groups);
        }
        // B-148 §3.5 — renderOrder mutation when groupId changes.
        if (!groupChanged) return groups;
        const ref = 'item:' + id;
        const nextGroups = [...groups];
        // 1. Strip from source group (if item was in a non-null group).
        if (prevGroupId !== null && prevGroupId !== undefined) {
          const srcIdx = nextGroups.findIndex((g) => g.id === prevGroupId);
          if (srcIdx >= 0) {
            const src = nextGroups[srcIdx];
            if (Array.isArray(src.renderOrder) && src.renderOrder.includes(ref)) {
              const filtered = src.renderOrder.filter((r) => r !== ref);
              nextGroups[srcIdx] = { ...src, renderOrder: filtered, updatedAt: Date.now() };
            }
          }
        }
        // 2. Append to target group (if patch.groupId is non-null).
        if (patch.groupId !== null && patch.groupId !== undefined) {
          const tgtIdx = nextGroups.findIndex((g) => g.id === patch.groupId);
          if (tgtIdx >= 0) {
            const tgt = nextGroups[tgtIdx];
            const existing = Array.isArray(tgt.renderOrder) ? [...tgt.renderOrder] : [];
            if (!existing.includes(ref)) {
              existing.push(ref);
              nextGroups[tgtIdx] = { ...tgt, renderOrder: existing, updatedAt: Date.now() };
            }
          }
        }
        return nextGroups;
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
  /* B-148 §3.5 — closure carries deletedGroupId from items mutator to groups
     mutator. Both mutators see the same serialized snapshot; sequencing is
     by ops-array order. */
  let deletedGroupId = null;
  let didDelete = false;
  await writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        const idx = items.findIndex((it) => it.id === id);
        if (idx < 0) return items; // idempotent no-op on unknown id
        // B-051 AC1/AC2: capture groupId before removal, then normalise that bucket.
        deletedGroupId = items[idx].groupId;
        didDelete = true;
        const out = items.slice();
        out.splice(idx, 1);
        return normaliseGroupSortOrders(deletedGroupId, out);
      },
    },
    {
      /* B-148 §3.5 (S44, v6→v7) — strip `item:<id>` from owning Group's
         renderOrder. Skips when the deleted item was Ungrouped, OR when
         deleteItem was a no-op (unknown id). */
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        if (!didDelete || deletedGroupId === null) return groups;
        const idx = groups.findIndex((g) => g.id === deletedGroupId);
        if (idx < 0) return groups; /* defensive — group may have been deleted */
        const g = groups[idx];
        if (!Array.isArray(g.renderOrder) || g.renderOrder.length === 0) return groups;
        const ref = 'item:' + id;
        const filtered = g.renderOrder.filter((r) => r !== ref);
        if (filtered.length === g.renderOrder.length) return groups; /* ref wasn't there */
        const next = [...groups];
        next[idx] = { ...g, renderOrder: filtered, updatedAt: Date.now() };
        return next;
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
          if (toAppend.length === 0) return items;
          // B-051 AC1/AC2: assign sortOrders relative to existing bucket sizes,
          // then normalise every affected bucket to close any pre-existing gaps.
          const bucketSizes = new Map();
          for (const it of items) {
            bucketSizes.set(it.groupId, (bucketSizes.get(it.groupId) ?? 0) + 1);
          }
          const orderedAppend = toAppend.map((item) => {
            const current = bucketSizes.get(item.groupId) ?? 0;
            bucketSizes.set(item.groupId, current + 1);
            return { ...item, sortOrder: current };
          });
          // Update txCreated sortOrders to match what will be stored.
          for (let i = 0; i < txCreated.length; i++) {
            txCreated[i] = orderedAppend[i];
          }
          let merged = [...items, ...orderedAppend];
          // Normalise each distinct groupId bucket that received new items.
          const affectedGroups = new Set(orderedAppend.map((it) => it.groupId));
          for (const gid of affectedGroups) {
            merged = normaliseGroupSortOrders(gid, merged);
          }
          // Sync txCreated sortOrders to final normalised values.
          const mergedById = new Map(merged.map((it) => [it.id, it]));
          for (let i = 0; i < txCreated.length; i++) {
            const normalised = mergedById.get(txCreated[i].id);
            if (normalised) txCreated[i] = normalised;
          }
          return merged;
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
 * Bulk-delete items by id array with partial-success semantics.
 * Unknown ids are reported in `notFound`; found ids are deleted in a single
 * writeTransaction.
 *
 * @param {string[]} ids
 * @returns {Promise<{deleted: string[], notFound: string[]}>}
 */
export async function bulkDeleteItems(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'bulkDeleteItems: ids must be a non-empty array');
  }
  if (ids.length > MAX_BULK_INPUTS) {
    throw new StorageError(ERR_VALIDATION, `bulkDeleteItems: ids array exceeds maximum of ${MAX_BULK_INPUTS}`);
  }
  for (const id of ids) {
    if (typeof id !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkDeleteItems: all ids must be strings');
    }
  }

  const idSet = new Set(ids);
  const deleted = [];
  const notFound = [];

  await writeTransaction([
    {
      partition: PARTITION_ITEMS,
      mutator: (items) => {
        const existingIds = new Set(items.map((it) => it.id));
        for (const id of idSet) {
          if (existingIds.has(id)) {
            deleted.push(id);
          } else {
            notFound.push(id);
          }
        }
        return items.filter((it) => !idSet.has(it.id));
      },
    },
  ]);

  return { deleted, notFound };
}

/**
 * Bulk-update items' groupId by id array + patch with partial-success semantics.
 * Only `groupId` is supported in the patch. Unknown ids are reported in `notFound`.
 *
 * @param {string[]} ids
 * @param {{groupId: string|null}} patch
 * @returns {Promise<{updated: string[], notFound: string[]}>}
 */
export async function bulkUpdateItems(ids, patch) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'bulkUpdateItems: ids must be a non-empty array');
  }
  if (ids.length > MAX_BULK_INPUTS) {
    throw new StorageError(ERR_VALIDATION, `bulkUpdateItems: ids array exceeds maximum of ${MAX_BULK_INPUTS}`);
  }
  for (const id of ids) {
    if (typeof id !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkUpdateItems: all ids must be strings');
    }
  }
  if (!patch || typeof patch !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'bulkUpdateItems: patch required');
  }
  const allowed = ['groupId'];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) {
      throw new StorageError(ERR_VALIDATION, 'bulkUpdateItems: only groupId is supported in patch');
    }
  }
  if ('groupId' in patch && patch.groupId !== null && typeof patch.groupId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'bulkUpdateItems: groupId must be string or null');
  }

  const idSet = new Set(ids);
  const updated = [];
  const notFound = [];
  const now = Date.now();

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
        if ('groupId' in patch) {
          assertGroupExists(patch.groupId, groupsSnapshot);
        }
        const existingIds = new Set(items.map((it) => it.id));
        // B-051 M-2: pre-build id→item map to avoid O(n×m) linear scan.
        const itemById = new Map(items.map((it) => [it.id, it]));
        // Track source groupIds before the patch so we can normalise them too.
        const sourceGroups = new Set();
        for (const id of idSet) {
          if (existingIds.has(id)) {
            updated.push(id);
            const src = itemById.get(id);
            if (src && 'groupId' in patch && src.groupId !== patch.groupId) {
              sourceGroups.add(src.groupId);
            }
          } else {
            notFound.push(id);
          }
        }
        let out = items.map((it) => {
          if (!idSet.has(it.id)) return it;
          return { ...it, ...patch, id: it.id, createdAt: it.createdAt, updatedAt: now };
        });
        // B-051 AC1/AC2: normalise destination group and all vacated source groups.
        if ('groupId' in patch) {
          out = normaliseGroupSortOrders(patch.groupId, out);
          for (const gid of sourceGroups) {
            out = normaliseGroupSortOrders(gid, out);
          }
        }
        return out;
      },
    },
  ]);

  return { updated, notFound };
}

/**
 * B-030 — bulk-reorder items with per-item `sortOrder` (and optional
 * `groupId`) updates in a single writeTransaction. Unlike `bulkUpdateItems`
 * (uniform-patch, groupId-only), each update is independent.
 *
 * Every group touched by the reorder is normalised post-update so sortOrder
 * values are consecutive integers (0, 1, 2, …). The caller may provide
 * spaced-out sortOrder values (e.g., 0, 1000, 2000) — normalisation
 * compresses them. Partial-success semantics: unknown ids surface in
 * `notFound`; known ids are applied.
 *
 * @param {Array<{id: string, sortOrder: number, groupId?: string|null}>} updates
 * @returns {Promise<{updated: string[], notFound: string[]}>}
 */
export async function bulkReorderItems(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'bulkReorderItems: updates must be a non-empty array');
  }
  if (updates.length > MAX_BULK_INPUTS) {
    throw new StorageError(ERR_VALIDATION, `bulkReorderItems: updates array exceeds maximum of ${MAX_BULK_INPUTS}`);
  }
  for (const u of updates) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderItems: every update must have a string id');
    }
    if (typeof u.sortOrder !== 'number' || !Number.isFinite(u.sortOrder)) {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderItems: every update must have a finite sortOrder');
    }
    if ('groupId' in u && u.groupId !== null && typeof u.groupId !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderItems: groupId must be string or null when present');
    }
  }

  const updateById = new Map(updates.map((u) => [u.id, u]));
  const updated = [];
  const notFound = [];
  const now = Date.now();

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
        /* Validate any proposed groupId exists. */
        for (const u of updates) {
          if ('groupId' in u) assertGroupExists(u.groupId, groupsSnapshot);
        }

        const existingIds = new Set(items.map((it) => it.id));
        const affectedGroups = new Set();

        /* Track source groupIds for cross-group moves so they get normalised too. */
        const itemById = new Map(items.map((it) => [it.id, it]));
        for (const u of updates) {
          if (!existingIds.has(u.id)) {
            notFound.push(u.id);
            continue;
          }
          updated.push(u.id);
          const src = itemById.get(u.id);
          if (src) affectedGroups.add(src.groupId);
          if ('groupId' in u) affectedGroups.add(u.groupId ?? null);
        }

        /* Apply per-item updates. */
        let out = items.map((it) => {
          const u = updateById.get(it.id);
          if (!u) return it;
          const nextGroupId = 'groupId' in u ? (u.groupId ?? null) : it.groupId;
          return {
            ...it,
            sortOrder: u.sortOrder,
            groupId: nextGroupId,
            id: it.id,
            createdAt: it.createdAt,
            updatedAt: now,
          };
        });

        /* Normalise every affected bucket to consecutive integers. */
        for (const gid of affectedGroups) {
          out = normaliseGroupSortOrders(gid, out);
        }

        return out;
      },
    },
  ]);

  return { updated, notFound };
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
