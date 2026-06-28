/**
 * Atomic commit path for MSG_IMPORT_COLLECTION — B-044 / B-045 (§33.7).
 *
 * Consumes a normalized import snapshot (produced by either html-parser.js or
 * — when B-045 lands — json-validator.js) and applies the single atomic
 * writeTransaction that replaces `tj:items`, `tj:groups`, and optionally
 * `tj:prefs`. Transient partitions (`tj:drift`, `tj:floatingGroups`, and the
 * durable `tj:itemClaims` claim store) are reset *outside* the primary
 * writeTransaction per §33.7's partial-atomicity rationale: the items/groups
 * swap is the contract; the transients are self-healing cleanup. B-179 §75.4.4
 * re-pointed the claim reset from the retired `tj:tabClaims` (session) key to
 * the durable partition — `tj:itemClaims` is now the SOLE persisted claim store.
 *
 * D-3 atomicity guarantee: a single `writeTransaction` replaces every user-
 * data partition in one chrome.storage.local.set. The R4 security-reviewer
 * greps this file for multiple write calls and flags any splits.
 */

import {
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  PARTITION_DRIFT,
  PARTITION_FLOATING_GROUPS,
  PARTITION_ITEM_CLAIMS,
  ITEM_CLAIMS_SCHEMA_VERSION,
  DEFAULT_PREFERENCES,
} from '../storage/shapes.js';
import { writeTransaction } from '../storage/write-transaction.js';
import {
  sanitizeItem,
  sanitizeGroup,
} from '../../shared/export-schema.js';

/**
 * Commit a parsed import snapshot.
 *
 * @param {Object} args
 * @param {Array<Object>} args.items   Items post-parse — already have minted ULIDs,
 *                                     valid groupId refs, sortOrder, createdAt,
 *                                     updatedAt. The commit runs each record
 *                                     through `sanitizeItem` as defence-in-depth:
 *                                     any stray field is stripped by the §32.5
 *                                     allow-list before it reaches storage.
 * @param {Array<Object>} args.groups  Groups post-parse.
 * @param {Object|null} [args.preferences]
 *   If present, written verbatim to `tj:prefs` (merged over DEFAULT_PREFERENCES).
 *   Omitted/absent → `tj:prefs` is left untouched.
 * @returns {Promise<{itemsImported: number, groupsImported: number}>}
 */
export async function commitImport({ items, groups, preferences }) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Defence-in-depth: run every record through the §32.5 allow-list one last
  // time. Parser output SHOULD already be clean, but R4 security asks for a
  // non-bypassable boundary at the write edge.
  const nowMs = Date.now();
  const scrubbedItems = safeItems.map((it) => {
    const clean = sanitizeItem(it);
    if (!Number.isFinite(clean.createdAt)) clean.createdAt = nowMs;
    if (!Number.isFinite(clean.updatedAt)) clean.updatedAt = nowMs;
    if (!Number.isFinite(clean.sortOrder)) clean.sortOrder = 0;
    return clean;
  });
  const scrubbedGroups = safeGroups.map((g) => {
    const clean = sanitizeGroup(g);
    if (!Number.isFinite(clean.createdAt)) clean.createdAt = nowMs;
    if (!Number.isFinite(clean.updatedAt)) clean.updatedAt = nowMs;
    if (!Number.isFinite(clean.sortOrder)) clean.sortOrder = 0;
    if (typeof clean.collapsed !== 'boolean') clean.collapsed = false;
    return clean;
  });

  /* B-148 §3.5 (S44, v6→v7) — bootstrap renderOrder for every scrubbed group
     from the scrubbed items. REPLACE-mode wipes floating-groups in the
     subsequent transient-partition reset, so renderOrder is items-only at
     this stage. Group items by groupId, sort by sortOrder asc, encode as
     'item:<id>' refs. The shape validator (isGroup) accepts this form.
     updatedAt is bumped to reflect the mutation. */
  const itemsByGroup = new Map();
  for (const it of scrubbedItems) {
    if (it.groupId === null || it.groupId === undefined) continue;
    if (!itemsByGroup.has(it.groupId)) itemsByGroup.set(it.groupId, []);
    itemsByGroup.get(it.groupId).push(it);
  }
  for (const arr of itemsByGroup.values()) {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  for (const g of scrubbedGroups) {
    const groupItems = itemsByGroup.get(g.id) || [];
    g.renderOrder = groupItems.map((it) => 'item:' + it.id);
    g.updatedAt = nowMs;
  }

  /* Single atomic writeTransaction across items + groups + (optional) prefs.
     Mutator functions ignore the prior partition contents — this is a REPLACE.
     The writeTransaction runs the shape validators post-mutation; corrupt
     output never reaches storage. */
  const ops = [
    { partition: PARTITION_ITEMS, mutator: () => scrubbedItems },
    { partition: PARTITION_GROUPS, mutator: () => scrubbedGroups },
  ];
  if (preferences && typeof preferences === 'object') {
    ops.push({
      partition: PARTITION_PREFS,
      mutator: () => ({ ...DEFAULT_PREFERENCES, ...preferences }),
    });
  }
  await writeTransaction(ops);

  /* Transient-partition resets. These run in a SECOND writeTransaction —
     structurally separate from the main items/groups/prefs swap so that a
     failure here cannot roll back the primary commit. Their failure modes are
     self-healing (§33.7 + B-017 partial-atomicity precedent): drift records
     lazily clear at read time; floating groups rebuild on tab events. A
     failure here logs a warning and never rejects the overall import — the
     items/groups swap is the contract. Using writeTransaction (not a raw
     chrome.storage.local.set) preserves the single-writer invariant and
     keeps shape validation on the write path. */
  try {
    await writeTransaction([
      { partition: PARTITION_DRIFT, mutator: () => ({}) },
      { partition: PARTITION_FLOATING_GROUPS, mutator: () => [] },
      /* B-179 §75.4.4 — reset the durable claim store. Post-cutover
         `tj:itemClaims` is the SOLE persisted claim store (the session
         `tj:tabClaims` reset this replaced is retired). Without this, import
         silently leaves stale claims pointing at pre-import tabs (ghost-live
         rows). Entries are cleared to `{}`; the partition-level sessionTag +
         schemaVersion are preserved so the SW lifetime's tag is not lost. */
      {
        partition: PARTITION_ITEM_CLAIMS,
        mutator: (cur) => ({
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: (cur && typeof cur.sessionTag === 'string') ? cur.sessionTag : '',
          entries: {},
        }),
      },
    ]);
  } catch (err) {
    console.warn('[import] transient partition reset failed:', err && err.message ? err.message : String(err));
  }

  return {
    itemsImported: scrubbedItems.length,
    groupsImported: scrubbedGroups.length,
  };
}
