/**
 * Tab Junkie JSON backup validator — B-045 (Sprint 18 Wave 4).
 *
 * Pure function. Input: raw UTF-8 text. Output: normalized
 * `{ items, groups, preferences?, repairs }` where every item and group has
 * a freshly-minted ULID (§33.8) and every record has been passed through the
 * §32.5 allow-list (C-7 — iterate the allow-list, never the input keys).
 *
 * No chrome.* API, no storage writes, no DOM, no network.
 *
 * The module replaces the Wave 3 stub that threw `ERR_INVALID_FORMAT`.
 * Sibling entry points:
 *   - `background/import/index.js`    — dispatcher: `format === 'json'` path
 *   - `background/import/commit.js`   — reused as-is from B-044
 *   - `shared/export-schema.js`       — allow-list constants + sanitizers
 *
 * §33.6 flow (R2 design, unchanged):
 *   1. JSON.parse(content)                          → ERR_INVALID_FORMAT on throw
 *   2. Root-shape validation (§32.5.1)              → ERR_MALFORMED_ROOT on fail
 *   3. schemaVersion gate (= / < / > KNOWN_VERSION) → ERR_UNKNOWN_SCHEMA_VERSION for >,
 *                                                     in-memory MIGRATION_STEPS for <
 *   4. Allow-list sanitize (every item + group)     → unknown fields dropped silently
 *   5. Auto-repair passes (in order):
 *        a) duplicate IDs (items, groups)           → mint fresh ULIDs per collision
 *        b) cross-ref rewrite from old→new map
 *        c) circular parentId cycles                → break junior edge (larger createdAt, id tiebreak)
 *        d) orphaned sub-groups                     → parentId := null
 *        e) orphaned items                          → groupId := null
 *        f) duplicate URLs in-file (§32.5.5 order)  → first wins
 *   6. ULID re-mint (C-4) — every imported record gets a fresh ULID;
 *      cross-refs rewritten through the old→new map built during step 5.
 *   7. Preferences validate (§32.5.4 enums)         → shape-invalid ⇒ drop + flag
 *   8. Return { items, groups, preferences?, repairs }
 *
 * R4 security-reviewer contract:
 *   - `sanitizeItem` / `sanitizeGroup` from `shared/export-schema.js` iterate
 *     the allow-list constants — never the input's own-keys. R4 greps for the
 *     inverse pattern and flags any `Object.keys(input).filter(...)` here as
 *     CRITICAL (C-7, Sprint 17 retro).
 *   - Every returned record's `id` is a freshly-minted ULID (C-4, §33.8).
 *     File-provided IDs are mapped through an in-memory table for cross-
 *     reference rewrite only — they never survive into the returned snapshot.
 *   - No dynamic code: no `eval`, no `new Function`, no `Function.*.bind`.
 *     JSON.parse is the ONLY parse primitive.
 */

import { ulid } from '../storage/ids.js';
import { GROUP_COLORS } from '../../shared/constants.js';
import { normalizeUrl } from '../../shared/url.js';
import {
  MAX_TITLE,
  MAX_URL,
  MAX_NAME,
  MAX_COLOR,
  DEFAULT_PREFERENCES,
} from '../storage/shapes.js';
import {
  ITEM_ALLOWED_FIELDS,
  ITEM_ALLOWED_OPTIONAL_FIELDS,
  GROUP_ALLOWED_FIELDS,
  sanitizeItem,
  sanitizeGroup,
} from '../../shared/export-schema.js';
import { KNOWN_VERSION } from '../storage/migration.js';
import {
  StorageError,
  ERR_INVALID_FORMAT,
  ERR_MALFORMED_ROOT,
  ERR_UNKNOWN_SCHEMA_VERSION,
  ERR_UNREPAIRABLE,
} from '../../shared/errors.js';

/* =========================================================================
 * Root-shape validation (§32.5.1)
 * ========================================================================= */

/**
 * Validate the root object against the §32.5.1 contract. Throws
 * StorageError(ERR_MALFORMED_ROOT) on any shape failure; the message
 * includes the failing field path for developer observability (AC2
 * forbids logging content — field paths are structural and safe).
 *
 * @param {unknown} root
 * @returns {void}
 */
function assertRootShape(root) {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw new StorageError(
      ERR_MALFORMED_ROOT,
      'Backup root is not an object',
    );
  }
  const r = /** @type {Record<string, unknown>} */ (root);
  if (
    typeof r.schemaVersion !== 'number'
    || !Number.isInteger(r.schemaVersion)
    || r.schemaVersion < 1
  ) {
    throw new StorageError(
      ERR_MALFORMED_ROOT,
      'Backup schemaVersion is missing or invalid',
    );
  }
  if (typeof r.exportedAt !== 'string') {
    throw new StorageError(
      ERR_MALFORMED_ROOT,
      'Backup exportedAt is missing or not a string',
    );
  }
  if (!Array.isArray(r.items)) {
    throw new StorageError(
      ERR_MALFORMED_ROOT,
      'Backup items is missing or not an array',
    );
  }
  if (!Array.isArray(r.groups)) {
    throw new StorageError(
      ERR_MALFORMED_ROOT,
      'Backup groups is missing or not an array',
    );
  }
  if (r.preferences !== undefined) {
    if (r.preferences === null || typeof r.preferences !== 'object' || Array.isArray(r.preferences)) {
      throw new StorageError(
        ERR_MALFORMED_ROOT,
        'Backup preferences is not an object',
      );
    }
  }
}

/* =========================================================================
 * Preferences (§32.5.4) — shape-invalid inputs are dropped, NOT thrown
 * ========================================================================= */

/**
 * AC10 — validate imported preferences against the §32.5.4 contract. Returns
 * null if any key is shape-invalid; the importer flags `preferencesSkipped`
 * and continues without applying prefs (non-blocking).
 *
 * @param {unknown} raw
 * @returns {Object|null}
 */
function validatePreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = /** @type {Record<string, unknown>} */ (raw);
  if (p.theme !== undefined && p.theme !== 'light' && p.theme !== 'dark' && p.theme !== 'system') {
    return null;
  }
  if (p.displayMode !== undefined && p.displayMode !== 'sidepanel' && p.displayMode !== 'window') {
    return null;
  }
  if (p.newTabOverride !== undefined && typeof p.newTabOverride !== 'boolean') {
    return null;
  }
  if (p.autoCollapseSubGroups !== undefined && typeof p.autoCollapseSubGroups !== 'boolean') {
    return null;
  }
  /* Build a full-shape object the commit path will pass through — merge over
     DEFAULT_PREFERENCES so any missing key lands with its default. Unknown
     keys pass through verbatim (forward-compat per §32.5.4). */
  return { ...DEFAULT_PREFERENCES, ...p };
}

/* =========================================================================
 * Per-record allow-list + coercion
 * ========================================================================= */

/**
 * Run each input record through the shared allow-list sanitizer, then apply
 * field-level coercion: enforce string types on id/title/url etc., clamp
 * numeric fields to finite numbers, and enforce length caps to match the
 * storage-layer shape validators (§5). A record that fails the allow-list
 * coercion is DROPPED (not thrown) so the import survives adversarial
 * noise; the caller can compare `input.length` vs. `output.length` to
 * derive a skip count.
 *
 * NOTE: IDs on the returned records are INPUT IDs — final ULID minting
 * happens at step 6 after the cross-reference map is built.
 *
 * @param {Array<unknown>} rawItems
 * @returns {Array<Object>}
 */
function normalizeItems(rawItems) {
  const out = [];
  const nowMs = Date.now();
  for (const r of rawItems) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const clean = sanitizeItem(r);
    if (typeof clean.id !== 'string' || clean.id.length === 0) continue;
    if (typeof clean.title !== 'string') continue;
    if (typeof clean.url !== 'string' || clean.url.length === 0) continue;
    let normalizedUrl;
    try {
      normalizedUrl = normalizeUrl(clean.url, { forStorage: true });
    } catch {
      /* AC15: unsupported scheme (javascript:, data:, etc.) → drop record. */
      continue;
    }
    if (normalizedUrl.length > MAX_URL) continue;
    let title = clean.title;
    if (title.length === 0) title = normalizedUrl;
    if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE);
    const groupId = typeof clean.groupId === 'string' && clean.groupId.length > 0
      ? clean.groupId
      : null;
    const sortOrder = Number.isFinite(clean.sortOrder) ? Number(clean.sortOrder) : 0;
    const createdAt = Number.isFinite(clean.createdAt) ? Number(clean.createdAt) : nowMs;
    const updatedAt = Number.isFinite(clean.updatedAt) ? Number(clean.updatedAt) : nowMs;
    const rec = {
      id: clean.id,
      title,
      url: normalizedUrl,
      groupId,
      sortOrder,
      createdAt,
      updatedAt,
    };
    /* Pass through optional fields (§32.5.2 ITEM_ALLOWED_OPTIONAL_FIELDS). */
    for (const k of ITEM_ALLOWED_OPTIONAL_FIELDS) {
      if (k in clean && Number.isFinite(clean[k])) rec[k] = Number(clean[k]);
    }
    out.push(rec);
  }
  return out;
}

/**
 * Same as `normalizeItems` but for groups.
 * @param {Array<unknown>} rawGroups
 * @returns {Array<Object>}
 */
function normalizeGroups(rawGroups) {
  const out = [];
  const nowMs = Date.now();
  for (const r of rawGroups) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const clean = sanitizeGroup(r);
    if (typeof clean.id !== 'string' || clean.id.length === 0) continue;
    if (typeof clean.name !== 'string') continue;
    let name = clean.name;
    if (name.length === 0) name = 'Folder';
    if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);
    const color = typeof clean.color === 'string' && clean.color.length > 0
      ? (clean.color.length > MAX_COLOR ? clean.color.slice(0, MAX_COLOR) : clean.color)
      : GROUP_COLORS[0];
    const parentId = typeof clean.parentId === 'string' && clean.parentId.length > 0
      ? clean.parentId
      : null;
    const sortOrder = Number.isFinite(clean.sortOrder) ? Number(clean.sortOrder) : 0;
    const collapsed = typeof clean.collapsed === 'boolean' ? clean.collapsed : false;
    const createdAt = Number.isFinite(clean.createdAt) ? Number(clean.createdAt) : nowMs;
    const updatedAt = Number.isFinite(clean.updatedAt) ? Number(clean.updatedAt) : nowMs;
    out.push({
      id: clean.id,
      name,
      color,
      parentId,
      sortOrder,
      collapsed,
      createdAt,
      updatedAt,
    });
  }
  return out;
}

/* =========================================================================
 * Auto-repair passes
 * ========================================================================= */

/**
 * AC7 — assign fresh ULIDs to every subsequent occurrence of a duplicate id
 * in the array. The first occurrence keeps its id. Mutates records in place.
 *
 * @param {Array<{id: string}>} records
 * @returns {{duplicates: number, oldToNewByIndex: Map<number, string>}}
 *   oldToNewByIndex maps array-index → newly-minted id for later cross-ref
 *   rewriting. The KEY is the array index of the renamed record (not the
 *   old id) because the "last-duplicate wins" disambiguation rule means the
 *   same old id may have multiple new ids.
 */
function mintFreshIdsForDuplicates(records) {
  const seen = new Set();
  /** @type {Map<number, string>} */
  const oldToNewByIndex = new Map();
  let duplicates = 0;
  for (let i = 0; i < records.length; i += 1) {
    const id = records[i].id;
    if (seen.has(id)) {
      const fresh = ulid();
      records[i].id = fresh;
      oldToNewByIndex.set(i, fresh);
      duplicates += 1;
    } else {
      seen.add(id);
    }
  }
  return { duplicates, oldToNewByIndex };
}

/**
 * AC7 disambiguation — "links follow the last-written duplicate." Build a
 * Map<originalId, finalId> where the "final" id is the id of the LAST record
 * with that input id (after mintFreshIdsForDuplicates already renamed
 * subsequent occurrences). This is what cross-references should resolve to.
 *
 * @param {Array<{id: string}>} records
 * @param {Array<string>} originalIds  — pre-rename snapshot of each record's id
 * @returns {Map<string, string>}  originalId → latest-final-id
 */
function buildLastWinsMap(records, originalIds) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (let i = 0; i < records.length; i += 1) {
    map.set(originalIds[i], records[i].id);
  }
  return map;
}

/**
 * AC6 — break any parentId cycle. The "junior" edge loses — junior is the
 * group with the greater createdAt (later creation), ties broken by greater
 * id lexicographically. The broken edge's parentId is set to null.
 *
 * Runs in O(n·depth). With pre-flattening (group depth ≤ 1 post-import in
 * practice) depth is small; the algorithm is safe for worst-case 10k inputs.
 *
 * @param {Array<Object>} groups  — may be mutated in place
 * @returns {number}  cycles broken
 */
function breakCycles(groups) {
  /** @type {Map<string, Object>} */
  const byId = new Map();
  for (const g of groups) byId.set(g.id, g);
  let broken = 0;
  for (const start of groups) {
    /* For each group, walk up parentId. If we revisit a node in this walk,
       there's a cycle. Break the junior edge. */
    let visited = new Set();
    let cursor = start;
    while (cursor && cursor.parentId) {
      if (visited.has(cursor.id)) break; // safety net
      visited.add(cursor.id);
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      if (visited.has(parent.id)) {
        /* Cycle: the edge from `cursor` → `parent` closes a loop. Identify
           the junior node among the nodes in `visited` (cycle members). We
           take the cycle subset as visited ∪ {parent} starting from parent's
           re-entry point to `cursor`, walking `visited` in iteration order. */
        const cycleMembers = [];
        for (const id of visited) {
          cycleMembers.push(byId.get(id));
        }
        cycleMembers.push(parent);
        /* The junior is the group with the greater createdAt; ties broken by
           greater id lex. */
        let junior = cycleMembers[0];
        for (const m of cycleMembers) {
          if (
            (m.createdAt || 0) > (junior.createdAt || 0)
            || ((m.createdAt || 0) === (junior.createdAt || 0) && m.id > junior.id)
          ) {
            junior = m;
          }
        }
        junior.parentId = null;
        broken += 1;
        break;
      }
      cursor = parent;
    }
  }
  return broken;
}

/**
 * AC5 — any group whose parentId does not resolve to a live group in the
 * post-dedup snapshot has its parentId set to null. Mutates in place.
 *
 * @param {Array<Object>} groups
 * @returns {number}  orphans reparented
 */
function repairOrphanedGroups(groups) {
  const live = new Set(groups.map((g) => g.id));
  let count = 0;
  for (const g of groups) {
    if (g.parentId != null && !live.has(g.parentId)) {
      g.parentId = null;
      count += 1;
    }
  }
  return count;
}

/**
 * AC8 — any item whose groupId does not resolve to a live group in the
 * post-dedup+repair snapshot has its groupId set to null. Mutates in place.
 *
 * @param {Array<Object>} items
 * @param {Array<Object>} groups
 * @returns {number}  orphans set to Ungrouped
 */
function repairOrphanedItems(items, groups) {
  const live = new Set(groups.map((g) => g.id));
  let count = 0;
  for (const it of items) {
    if (it.groupId != null && !live.has(it.groupId)) {
      it.groupId = null;
      count += 1;
    }
  }
  return count;
}

/**
 * AC12 — dedup items by normalized URL. Iterates in §32.5.5 order
 * (groupId null-first, then sortOrder, then id) so the "first" survivor is
 * deterministic. Mutates a fresh array (no in-place remove).
 *
 * @param {Array<Object>} items
 * @returns {{items: Array<Object>, duplicateUrls: number}}
 */
function dedupByUrl(items) {
  /* Stable sort via toSorted copy, then greedy first-wins. */
  const sorted = [...items].sort((a, b) => {
    /* groupId null first. */
    const ag = a.groupId ?? '';
    const bg = b.groupId ?? '';
    if (ag !== bg) {
      if (a.groupId === null) return -1;
      if (b.groupId === null) return 1;
      return ag < bg ? -1 : 1;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const seen = new Set();
  const keep = [];
  let duplicateUrls = 0;
  for (const it of sorted) {
    if (seen.has(it.url)) {
      duplicateUrls += 1;
      continue;
    }
    seen.add(it.url);
    keep.push(it);
  }
  return { items: keep, duplicateUrls };
}

/* =========================================================================
 * Entry point
 * ========================================================================= */

/**
 * Parse + validate + repair a Tab Junkie JSON backup.
 *
 * @param {string} content — raw UTF-8 file text
 * @returns {{
 *   items: Array<Object>,
 *   groups: Array<Object>,
 *   preferences?: Object,
 *   skipped: number,
 *   duplicateUrls: number,
 *   repairs: {
 *     orphanedGroups: number,
 *     cyclesBroken: number,
 *     duplicateIds: number,
 *     orphanedItems: number,
 *     duplicateUrls: number,
 *     preferencesSkipped: boolean
 *   }
 * }}
 * @throws {StorageError} — ERR_INVALID_FORMAT, ERR_MALFORMED_ROOT,
 *                          ERR_UNKNOWN_SCHEMA_VERSION, ERR_UNREPAIRABLE
 */
export function parseAndValidate(content /* , options */) {
  /* Step 1 — JSON.parse. */
  let root;
  try {
    root = JSON.parse(content);
  } catch {
    throw new StorageError(
      ERR_INVALID_FORMAT,
      'Backup file is malformed and cannot be imported',
    );
  }

  /* Step 2 — root-shape validation (§32.5.1). */
  assertRootShape(root);
  const typedRoot = /** @type {{schemaVersion: number, items: unknown[], groups: unknown[], preferences?: unknown}} */ (root);

  /* Step 3 — schemaVersion gate. */
  if (typedRoot.schemaVersion > KNOWN_VERSION) {
    throw new StorageError(
      ERR_UNKNOWN_SCHEMA_VERSION,
      'Backup was created in a newer version. Please update Tab Junkie before importing.',
    );
  }
  /* § 33.6 note: `schemaVersion < KNOWN_VERSION` is tolerated. MIGRATION_STEPS
     is currently empty (KNOWN_VERSION = 1), so no migration runs. When the
     first real migration lands, the in-memory migration hook below will apply
     the registered steps to the { items, groups, preferences, meta } snapshot
     before the normalize+repair passes. Until then the snapshot flows through
     unchanged, and the version is simply noted. */
  // TODO(sprint-19+): apply MIGRATION_STEPS in-memory here once the registry is non-empty.

  /* Step 4 — per-record allow-list + coercion. Records that fail coercion
     (wrong types, unsupported URL scheme, etc.) are dropped silently — the
     delta between the input length and the normalized length is `skipped`. */
  const rawItemsLen = typedRoot.items.length;
  const rawGroupsLen = typedRoot.groups.length;
  const items = normalizeItems(typedRoot.items);
  const groups = normalizeGroups(typedRoot.groups);
  const skippedItems = rawItemsLen - items.length;
  const skippedGroups = rawGroupsLen - groups.length;
  const skipped = skippedItems + skippedGroups;

  /* Step 5a — duplicate IDs: mint fresh ULIDs for every subsequent collision.
     Capture originalGroupIds BEFORE renaming so we can build the "last-wins"
     map for cross-reference rewrite. Items don't cross-reference each other,
     so we don't track pre-rename item ids. */
  const originalGroupIds = groups.map((g) => g.id);
  const groupDup = mintFreshIdsForDuplicates(groups);
  const itemDup = mintFreshIdsForDuplicates(items);
  const duplicateIds = groupDup.duplicates + itemDup.duplicates;

  /* Step 5b — cross-reference rewrite. For each item.groupId / group.parentId,
     resolve through the "last-wins" map to the most recent record that shared
     the original id. If the reference doesn't match any input id, leave it
     alone (step 5d/5e will handle the orphan). */
  const groupLastWins = buildLastWinsMap(groups, originalGroupIds);
  for (const g of groups) {
    if (g.parentId != null && groupLastWins.has(g.parentId)) {
      g.parentId = groupLastWins.get(g.parentId);
    }
  }
  for (const it of items) {
    if (it.groupId != null && groupLastWins.has(it.groupId)) {
      it.groupId = groupLastWins.get(it.groupId);
    }
  }

  /* Step 5c — break cycles. */
  const cyclesBroken = breakCycles(groups);

  /* Step 5d — orphaned sub-groups. */
  const orphanedGroups = repairOrphanedGroups(groups);

  /* Step 5e — orphaned items. */
  const orphanedItems = repairOrphanedItems(items, groups);

  /* Step 5f — dedup items by URL (§32.5.5 order). */
  const { items: dedupedItems, duplicateUrls } = dedupByUrl(items);

  /* Step 6 — ULID re-mint (C-4). EVERY record gets a fresh ULID regardless of
     whether it collided in step 5a. Build the pre-remint id → new-id map so
     cross-references survive the final rename. */
  /** @type {Map<string, string>} */
  const remintGroupMap = new Map();
  for (const g of groups) {
    const fresh = ulid();
    remintGroupMap.set(g.id, fresh);
    g.id = fresh;
  }
  for (const g of groups) {
    if (g.parentId != null && remintGroupMap.has(g.parentId)) {
      g.parentId = remintGroupMap.get(g.parentId);
    } else if (g.parentId != null) {
      /* Defensive: should have been caught by step 5d already. */
      g.parentId = null;
    }
  }
  for (const it of dedupedItems) {
    const fresh = ulid();
    it.id = fresh;
    if (it.groupId != null && remintGroupMap.has(it.groupId)) {
      it.groupId = remintGroupMap.get(it.groupId);
    } else if (it.groupId != null) {
      it.groupId = null;
    }
  }

  /* Step 6 assertion (§33.8) — every post-mint id must be unique. */
  {
    const itemIdSet = new Set(dedupedItems.map((it) => it.id));
    if (itemIdSet.size !== dedupedItems.length) {
      throw new StorageError(ERR_UNREPAIRABLE, 'Duplicate ULID after mint — internal error');
    }
    const groupIdSet = new Set(groups.map((g) => g.id));
    if (groupIdSet.size !== groups.length) {
      throw new StorageError(ERR_UNREPAIRABLE, 'Duplicate ULID after mint — internal error');
    }
  }

  /* Step 7 — preferences validation (AC10). */
  let preferences;
  let preferencesSkipped = false;
  if (typedRoot.preferences !== undefined) {
    const validated = validatePreferences(typedRoot.preferences);
    if (validated === null) {
      preferencesSkipped = true;
    } else {
      preferences = validated;
    }
  }

  /* Step 8 — defensive ERR_UNREPAIRABLE. If the source file was non-empty
     but every record survived neither normalize nor repair, refuse to land
     a zero-count import that would silently wipe storage on commit. */
  if (dedupedItems.length === 0 && groups.length === 0 && (rawItemsLen + rawGroupsLen) > 0) {
    throw new StorageError(
      ERR_UNREPAIRABLE,
      'Backup file contains unrecoverable errors',
    );
  }

  return {
    items: dedupedItems,
    groups,
    preferences,
    skipped,
    duplicateUrls,
    repairs: {
      orphanedGroups,
      cyclesBroken,
      duplicateIds,
      orphanedItems,
      duplicateUrls,
      preferencesSkipped,
    },
  };
}

/* =========================================================================
 * Backward-compat named export
 * ========================================================================= */

/**
 * Legacy symbol retained for the Wave 3 stub call path. Delegates to
 * `parseAndValidate`. Kept only so any stale imports don't crash; new
 * callers should use `parseAndValidate` directly.
 *
 * @param {string} content
 * @returns {ReturnType<typeof parseAndValidate>}
 */
export function validateAndRepair(content) {
  return parseAndValidate(content);
}

/* R3 note (§33.6 step 7): allow-list strip is implemented implicitly via
   `sanitizeItem` / `sanitizeGroup` in step 4 (normalize*). The allow-list
   iteration happens inside the shared sanitizers in `shared/export-schema.js`
   — this module never iterates `Object.keys(input)`. */
