/**
 * Group CRUD. Depth is hard-capped at 1 (top-level or one level of nesting).
 * Circular references in the parentId chain are rejected on updateGroup.
 * deleteGroup reparents all items and child groups to `null` atomically in
 * the same writeTransaction (AC7).
 */

import {
  StorageError,
  ERR_NOT_FOUND,
  ERR_VALIDATION,
  ERR_DEPTH_EXCEEDED,
  ERR_CIRCULAR_REF,
} from './errors.js';
import {
  PARTITION_GROUPS,
  PARTITION_ITEMS,
  MAX_NAME,
  MAX_COLOR,
  readPartition,
} from './partitions.js';
import { MAX_BULK_INPUTS } from './shapes.js';
import { GROUP_COLORS } from '../../shared/constants.js';
import { writeTransaction } from './write-transaction.js';
import { ulid } from './ids.js';

// ---- Depth + cycle enforcement --------------------------------------------
// Tab Junkie allows at most one level of nesting: a group with parentId=null
// is "top-level"; a group whose parentId points at a top-level group is at
// depth 1. Any parentId that would land the group at depth >= 2 is rejected.

/** Shared palette validation — used by both create and update validators. */
function assertValidColor(color) {
  if (typeof color !== 'string' || color.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'color must be a non-empty string');
  }
  if (color.length > MAX_COLOR) {
    throw new StorageError(ERR_VALIDATION, `color exceeds ${MAX_COLOR} chars`);
  }
  if (!GROUP_COLORS.includes(color)) {
    throw new StorageError(ERR_VALIDATION, `color must be one of: ${GROUP_COLORS.join(', ')}`);
  }
}

function findGroup(groups, id) {
  return groups.find((g) => g.id === id) ?? null;
}

/**
 * Reject if assigning `parentId` to a group of id `selfId` would:
 *  - point at a missing group,
 *  - point at a group that itself has a parent (depth would become 2),
 *  - or form a cycle (parentId chain eventually reaches selfId).
 * Top-level (parentId === null) is always allowed.
 */
function assertDepthAndCycle(groups, selfId, parentId) {
  if (parentId === null || parentId === undefined) return;
  const parent = findGroup(groups, parentId);
  if (!parent) {
    // M4 / ruling #4: missing-id situations surface as ERR_NOT_FOUND, not
    // ERR_VALIDATION, so the taxonomy stays consistent with `updateItem` et al.
    // M7: raw parentId goes into structured `cause`, not the message body.
    throw new StorageError(ERR_NOT_FOUND, 'parentId does not exist', { parentId });
  }
  if (parent.parentId !== null) {
    // Parent is itself nested → we would be at depth >= 2.
    throw new StorageError(ERR_DEPTH_EXCEEDED, 'Groups may be nested at most one level deep');
  }
  // Cycle detection: walk the would-be ancestor chain. With depth cap = 1
  // the chain is at most length 1, but we walk defensively in case the
  // on-disk shape has drifted.
  const visited = new Set();
  let cursor = parentId;
  while (cursor !== null) {
    if (cursor === selfId) {
      throw new StorageError(ERR_CIRCULAR_REF, 'parentId chain would form a cycle');
    }
    if (visited.has(cursor)) {
      throw new StorageError(ERR_CIRCULAR_REF, 'parentId chain already contains a cycle');
    }
    visited.add(cursor);
    const node = findGroup(groups, cursor);
    if (!node) break;
    cursor = node.parentId;
  }
}

function validateNewGroup(input) {
  if (!input || typeof input !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'createGroup: payload required');
  }
  const { name, color, parentId, sortOrder } = input;
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new StorageError(ERR_VALIDATION, 'createGroup: name must be non-empty string');
  }
  if (name.length > MAX_NAME) {
    throw new StorageError(ERR_VALIDATION, `createGroup: name exceeds ${MAX_NAME} chars`);
  }
  assertValidColor(color);
  if (parentId !== null && parentId !== undefined && typeof parentId !== 'string') {
    throw new StorageError(ERR_VALIDATION, 'createGroup: parentId must be string or null');
  }
  if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isFinite(sortOrder))) {
    throw new StorageError(ERR_VALIDATION, 'createGroup: sortOrder must be finite number');
  }
}

function validateGroupPatch(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new StorageError(ERR_VALIDATION, 'updateGroup: patch required');
  }
  if ('id' in patch || 'createdAt' in patch) {
    throw new StorageError(ERR_VALIDATION, 'updateGroup: id and createdAt are immutable');
  }
  // M2: `updatedAt` is always overwritten by the mutator — not caller-patchable.
  const allowed = ['name', 'color', 'parentId', 'sortOrder', 'collapsed'];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) {
      throw new StorageError(ERR_VALIDATION, 'updateGroup: unknown field', { field: k });
    }
  }
  if ('name' in patch) {
    if (typeof patch.name !== 'string' || patch.name.trim().length === 0) {
      throw new StorageError(ERR_VALIDATION, 'updateGroup: name must be non-empty string');
    }
    if (patch.name.length > MAX_NAME) {
      throw new StorageError(ERR_VALIDATION, `updateGroup: name exceeds ${MAX_NAME} chars`);
    }
  }
  if ('color' in patch) {
    assertValidColor(patch.color);
  }
  if ('sortOrder' in patch && (typeof patch.sortOrder !== 'number' || !Number.isFinite(patch.sortOrder))) {
    throw new StorageError(ERR_VALIDATION, 'updateGroup: sortOrder must be a finite number');
  }
}

/**
 * @param {{name: string, color: string, parentId: string|null, sortOrder?: number}} input
 */
export async function createGroup(input) {
  validateNewGroup(input);
  const now = Date.now();
  /** @type {import('./partitions.js').Group} */
  let created;
  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        const parentId = input.parentId ?? null;
        // Use a placeholder self-id for the depth/cycle check; the group is
        // not yet in the list so no cycle is possible, only depth needs to
        // be verified.
        assertDepthAndCycle(groups, '__new__', parentId);
        const hasDuplicateName = groups.some(
          (g) => g.name === input.name && g.parentId === parentId,
        );
        const stored = {
          id: ulid(),
          name: input.name,
          color: input.color,
          parentId,
          sortOrder: input.sortOrder ?? now,
          collapsed: false,
          createdAt: now,
          updatedAt: now,
        };
        // `stored` is persisted; `created` may carry a `warning` that is
        // returned to the caller but NOT written to storage.
        created = hasDuplicateName ? { ...stored, warning: 'DUPLICATE_NAME' } : stored;
        return [...groups, stored];
      },
    },
  ]);
  return created;
}

/** @param {string} id */
export async function getGroup(id) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'getGroup: id required');
  const groups = await readPartition(PARTITION_GROUPS);
  return findGroup(groups, id);
}

/**
 * @param {string} id
 * @param {Partial<import('./partitions.js').Group>} patch
 */
export async function updateGroup(id, patch) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'updateGroup: id required');
  validateGroupPatch(patch);
  /** @type {import('./partitions.js').Group|null} */
  let updated = null;
  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        const idx = groups.findIndex((g) => g.id === id);
        if (idx < 0) throw new StorageError(ERR_NOT_FOUND, 'Group not found', { id });
        if ('parentId' in patch) {
          const newParent = patch.parentId ?? null;
          assertDepthAndCycle(groups, id, newParent);
          // Also: if this group currently has children, moving it under any
          // parent would make its children depth=2. Block that.
          if (newParent !== null) {
            const hasChildren = groups.some((g) => g.parentId === id);
            if (hasChildren) {
              throw new StorageError(ERR_DEPTH_EXCEEDED, 'Cannot nest a group that already has children');
            }
          }
        }
        const stored = {
          ...groups[idx],
          ...patch,
          id: groups[idx].id,
          createdAt: groups[idx].createdAt,
          updatedAt: Date.now(),
        };
        const newName = stored.name;
        const newParentId = stored.parentId;
        const hasDuplicateName = groups.some(
          (g) => g.id !== id && g.name === newName && g.parentId === newParentId,
        );
        // `stored` is persisted; `updated` may carry a `warning` that is
        // returned to the caller but NOT written to storage.
        updated = hasDuplicateName ? { ...stored, warning: 'DUPLICATE_NAME' } : stored;
        const out = groups.slice();
        out[idx] = stored;
        return out;
      },
    },
  ]);
  return updated;
}

/**
 * Delete a group. Reparents every item whose `groupId === id` to `null`, and
 * every child group whose `parentId === id` to `null`, in the same
 * writeTransaction so the cascade is atomic (AC7).
 * @param {string} id
 */
export async function deleteGroup(id) {
  if (typeof id !== 'string') throw new StorageError(ERR_VALIDATION, 'deleteGroup: id required');
  // M8: capture `now` once and reuse across both mutators so cascaded
  // `updatedAt` stamps are consistent for this logical delete.
  const now = Date.now();
  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        const idx = groups.findIndex((g) => g.id === id);
        // H6 / ruling #3: idempotent silent no-op on unknown id. Do not
        // throw and do not mutate — matches deleteItem's new contract.
        if (idx < 0) return groups;
        const out = groups.slice();
        out.splice(idx, 1);
        // Orphan any children of the deleted group — move them to top-level.
        return out.map((g) => (g.parentId === id ? { ...g, parentId: null, updatedAt: now } : g));
      },
    },
    {
      partition: PARTITION_ITEMS,
      mutator: (items) =>
        items.map((it) => (it.groupId === id ? { ...it, groupId: null, updatedAt: now } : it)),
    },
  ]);
}

export async function listGroups() {
  return readPartition(PARTITION_GROUPS);
}

/**
 * B-031 — bulk-reorder groups with per-group `sortOrder` (and optional
 * `parentId`) updates in a single writeTransaction. Mirrors
 * `bulkReorderItems` in shape.
 *
 * Every depth bucket touched by the reorder is normalised post-update so
 * sortOrder values are consecutive integers scaled by the caller's gap
 * (the sidepanel emits `idx * 1000`; normalisation compresses to
 * `0, 1, 2, …`). Partial-success semantics: unknown ids surface in
 * `notFound`; known ids are applied.
 *
 * Depth + cycle invariants are enforced at the storage layer — the UI
 * pre-filter (filterGroupParentCandidates) is a fast-path, not the
 * authority. Any `parentId` change is validated with `assertDepthAndCycle`
 * and the existing "cannot nest a group that already has children" rule
 * from `updateGroup`; violations throw `ERR_DEPTH_EXCEEDED` /
 * `ERR_CIRCULAR_REF` and abort the whole transaction (atomic).
 *
 * @param {Array<{id: string, sortOrder: number, parentId?: string|null}>} updates
 * @returns {Promise<{updated: string[], notFound: string[]}>}
 */
export async function bulkReorderGroups(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'bulkReorderGroups: updates must be a non-empty array');
  }
  if (updates.length > MAX_BULK_INPUTS) {
    throw new StorageError(ERR_VALIDATION, `bulkReorderGroups: updates array exceeds maximum of ${MAX_BULK_INPUTS}`);
  }
  for (const u of updates) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderGroups: every update must have a string id');
    }
    if (typeof u.sortOrder !== 'number' || !Number.isFinite(u.sortOrder)) {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderGroups: every update must have a finite sortOrder');
    }
    if ('parentId' in u && u.parentId !== null && typeof u.parentId !== 'string') {
      throw new StorageError(ERR_VALIDATION, 'bulkReorderGroups: parentId must be string or null when present');
    }
  }

  const updateById = new Map(updates.map((u) => [u.id, u]));
  const updated = [];
  const notFound = [];
  const now = Date.now();

  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        const existingIds = new Set(groups.map((g) => g.id));
        /* Partition into applied / notFound. Validation (depth+cycle) runs
           AFTER partitioning so unknown ids surface cleanly without a depth
           check consulting a missing record. */
        for (const u of updates) {
          if (existingIds.has(u.id)) {
            updated.push(u.id);
          } else {
            notFound.push(u.id);
          }
        }

        /* Validate parentId changes against the pre-mutation snapshot.
           Ordering: assertDepthAndCycle first (catches missing parent,
           depth-2, cycles); then the "cannot nest a group that has
           children" rule — mirrors `updateGroup`. */
        for (const u of updates) {
          if (!existingIds.has(u.id)) continue;
          if (!('parentId' in u)) continue;
          const newParent = u.parentId ?? null;
          assertDepthAndCycle(groups, u.id, newParent);
          if (newParent !== null) {
            const hasChildren = groups.some((g) => g.parentId === u.id);
            if (hasChildren) {
              throw new StorageError(ERR_DEPTH_EXCEEDED, 'Cannot nest a group that already has children');
            }
          }
        }

        /* Collect affected buckets for post-apply normalisation: every
           update's new parentId bucket, plus the dragged group's PREVIOUS
           parentId bucket when the update crosses buckets. */
        const affectedBuckets = new Set();
        const preById = new Map(groups.map((g) => [g.id, g]));
        for (const u of updates) {
          if (!existingIds.has(u.id)) continue;
          const pre = preById.get(u.id);
          const preParent = pre?.parentId ?? null;
          const nextParent = 'parentId' in u ? (u.parentId ?? null) : preParent;
          affectedBuckets.add(nextParent);
          if (preParent !== nextParent) affectedBuckets.add(preParent);
        }

        /* Apply per-group patches. */
        let out = groups.map((g) => {
          const u = updateById.get(g.id);
          if (!u) return g;
          const nextParent = 'parentId' in u ? (u.parentId ?? null) : g.parentId;
          return {
            ...g,
            sortOrder: u.sortOrder,
            parentId: nextParent,
            id: g.id,
            createdAt: g.createdAt,
            updatedAt: now,
          };
        });

        /* Normalise every affected bucket to consecutive integers.
           Mirrors `normaliseGroupSortOrders` in items.js but keyed on
           parentId (not groupId) — the bucketing difference. */
        for (const bucketParentId of affectedBuckets) {
          const bucketEntries = [];
          for (let i = 0; i < out.length; i++) {
            if ((out[i].parentId ?? null) === bucketParentId) {
              bucketEntries.push({ idx: i, group: out[i] });
            }
          }
          bucketEntries.sort((a, b) => (a.group.sortOrder ?? 0) - (b.group.sortOrder ?? 0));
          const next = out.slice();
          for (let k = 0; k < bucketEntries.length; k++) {
            const { idx, group } = bucketEntries[k];
            if (group.sortOrder !== k) {
              next[idx] = { ...group, sortOrder: k, updatedAt: now };
            }
          }
          out = next;
        }

        return out;
      },
    },
  ]);

  return { updated, notFound };
}
