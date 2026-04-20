/**
 * search-index.js — B-052 fuzzy search index cache
 *
 * Pure, DOM-free, sidepanel-scoped in-memory search index for the B-021
 * inline filter. All logic here is ES-module-importable by Node tests and
 * the sidepanel runtime alike — no `document`, no `chrome.*`, no singletons.
 * §34 (docs/design/34-b-052-fuzzy-search-caching.md) is the authoritative
 * design contract; this file implements §34.3 (structure), §34.4
 * (invalidation), and §34.6 (search algorithm). §34.7 DOM-patch integration
 * lives in sidepanel.js and consumes the delta descriptors this module
 * returns.
 *
 * Index contract (structurally immutable via module API):
 *   {
 *     entries:    SearchEntry[]              // flat array, order = items order
 *     byId:       Map<string, SearchEntry>   // O(1) targeted-update lookup
 *     generation: number                     // bumped on every rebuild/patch
 *   }
 *
 *   The root object and `entries` array are shallow-frozen with
 *   `Object.freeze`, so property writes / array mutations throw in strict
 *   mode. `byId` is a native Map and cannot be frozen in the same way —
 *   `Object.freeze` on a Map does NOT seal its internal entries (`Map.set`
 *   and `Map.delete` still succeed silently in strict mode). The contract
 *   is therefore "defensively scoped": only this module's own `buildIndex`
 *   and `diffAndPatch` produce/mutate the `byId` Map, and every call in
 *   `diffAndPatch` builds a fresh Map rather than mutating the incoming
 *   one. External callers MUST NOT `byId.set()` / `byId.delete()` — any
 *   such mutation will be overwritten at the next `diffAndPatch` rebuild
 *   and silently drift the cache in the interim. Treat the Map as
 *   read-only (`get`, `has`, `size`, iteration) at all call sites.
 *
 * SearchEntry contract:
 *   { id, titleLower, urlLower, groupIdKey, hash }
 *
 *   hash encodes {id, title, url, groupId} — the four fields whose change
 *   invalidates an entry (Q-1 decision, see §34.4 open question). groupId
 *   is included so a group-move update correctly triggers a patch even
 *   when title + url are unchanged — the groupIdKey stored on the entry
 *   is a future scoped-search hook (§34.3) and must stay in sync.
 *
 * The module is intentionally free of the DOM-facing render path so
 * tests/b052-fuzzy-search-perf.test.js can exercise it against the
 * Node perf_hooks clock with zero render overhead.
 */

/** @typedef {{ id: string, title: string|null|undefined, url: string|null|undefined, groupId: string|null|undefined }} IndexableItem */

/**
 * @typedef {Object} SearchEntry
 * @property {string} id
 * @property {string} titleLower
 * @property {string} urlLower
 * @property {string} groupIdKey   item.groupId ?? '__ungrouped__'
 * @property {string} hash         field-level fingerprint for diff detection
 */

/**
 * @typedef {Object} SearchIndex
 * @property {ReadonlyArray<SearchEntry>} entries
 * @property {Map<string, SearchEntry>}   byId
 * @property {number}                     generation
 */

/* =========================================================================
   Tunables
   ========================================================================= */

/**
 * §34.4: when the add+remove delta between the cached entries and the
 * incoming items exceeds this count, `diffAndPatch` signals a full rebuild
 * instead of patching. At 1 000 items a full rebuild is ~5–10 ms of JS
 * work; patching > 10 individual entries approaches the same cost while
 * leaving more transient state windows.
 *
 * Rationale (Q-2):
 *   - 1 patch: ~0.05 ms (map.set + one hash compute)
 *   - 10 patches: ~0.5 ms
 *   - Full rebuild at 1 000 items: ~5–10 ms
 * The crossover (where N patches cost as much as one rebuild) sits at
 * roughly 100–200 single-field patches. Picking 10 keeps us well below
 * the crossover while preserving AC5's "no full re-render on single-item
 * updates" semantics — a single edit is always patched, a bulk
 * import/export is always rebuilt.
 */
export const BULK_REBUILD_THRESHOLD = 10;

/* =========================================================================
   Hash + entry construction
   ========================================================================= */

/**
 * Field-level fingerprint for diff detection. Cheap, order-stable, and
 * collision-resistant enough for a per-id compare — the null-byte separator
 * makes `("a", "b|c")` and `("a|b", "c")` distinguishable.
 *
 * @param {IndexableItem} item
 * @returns {string}
 */
function hashItem(item) {
  const title = item.title == null ? '' : String(item.title);
  const url = item.url == null ? '' : String(item.url);
  const groupId = item.groupId == null ? '' : String(item.groupId);
  return item.id + '\x00' + title + '\x00' + url + '\x00' + groupId;
}

/**
 * Build a single immutable entry from an item.
 * @param {IndexableItem} item
 * @returns {SearchEntry}
 */
function buildEntry(item) {
  const title = item.title == null ? '' : String(item.title);
  const url = item.url == null ? '' : String(item.url);
  const groupId = item.groupId == null ? null : String(item.groupId);
  return Object.freeze({
    id: String(item.id),
    titleLower: title.toLowerCase(),
    urlLower: url.toLowerCase(),
    groupIdKey: groupId == null ? '__ungrouped__' : groupId,
    hash: hashItem(item),
  });
}

/* =========================================================================
   Public: buildIndex
   ========================================================================= */

/**
 * Build a fresh index from an items array. Frozen shallowly so accidental
 * mutation (e.g. `index.entries.push(...)`) throws in strict mode and is
 * visible during tests. Note: `index.byId` is a Map and therefore cannot
 * be enforced-immutable — see the header comment's "structurally immutable
 * via module API" contract. Callers must not mutate it directly.
 *
 * @param {IndexableItem[]} items
 * @returns {SearchIndex}
 */
export function buildIndex(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const entries = new Array(safeItems.length);
  const byId = new Map();
  for (let i = 0; i < safeItems.length; i++) {
    const entry = buildEntry(safeItems[i]);
    entries[i] = entry;
    byId.set(entry.id, entry);
  }
  return Object.freeze({
    entries: Object.freeze(entries),
    byId,
    generation: 1,
  });
}

/**
 * Internal: build an index with a specified generation counter. Used by
 * the diff path so the caller can see a bumped generation on every patch.
 *
 * @param {SearchEntry[]} entries
 * @param {Map<string, SearchEntry>} byId
 * @param {number} generation
 * @returns {SearchIndex}
 */
function makeIndex(entries, byId, generation) {
  return Object.freeze({
    entries: Object.freeze(entries),
    byId,
    generation,
  });
}

/* =========================================================================
   Public: diffAndPatch
   ========================================================================= */

/**
 * @typedef {Object} IndexDelta
 * @property {'noop'|'patch'|'full-rebuild'} deltaType
 * @property {SearchIndex} index                          // the new index to install
 * @property {Array<{ id: string, kind: 'added'|'removed'|'updated' }>} affected
 *   Per-id change descriptors. Empty on 'noop' and 'full-rebuild'.
 *   Ordered: removed first, then updated, then added — the DOM patch path
 *   can apply them in that order without intermediate invalidation.
 */

/**
 * Diff the cached index against a fresh items array and return either a
 * patched index + per-id deltas (§34.7 DOM-patch path) or a `full-rebuild`
 * signal (bulk op).
 *
 * Contract:
 *   - 'noop'         → no observable change; DOM patch path should skip.
 *   - 'patch'        → affected ids enumerated; each has a 'kind'. DOM path
 *                      applies each delta in order (remove, update, add).
 *   - 'full-rebuild' → caller falls through to renderAll(). The index is
 *                      still rebuilt here so the caller can install it
 *                      without rebuilding a second time.
 *
 * @param {SearchIndex} currentIndex
 * @param {IndexableItem[]} nextItems
 * @returns {IndexDelta}
 */
export function diffAndPatch(currentIndex, nextItems) {
  const safeNext = Array.isArray(nextItems) ? nextItems : [];
  const nextIds = new Set();
  for (let i = 0; i < safeNext.length; i++) {
    const it = safeNext[i];
    if (it && it.id != null) nextIds.add(String(it.id));
  }

  /* Walk the current index once: classify as 'removed' or 'carry-over'. */
  const removedIds = [];
  for (const id of currentIndex.byId.keys()) {
    if (!nextIds.has(id)) removedIds.push(id);
  }

  /* Walk the next items once: classify as 'added' or 'updated' (hash differs)
     or 'unchanged' (hash matches current entry). */
  const addedIdxs = [];
  const updatedIdxs = [];
  for (let i = 0; i < safeNext.length; i++) {
    const it = safeNext[i];
    if (!it || it.id == null) continue;
    const id = String(it.id);
    const cur = currentIndex.byId.get(id);
    if (cur === undefined) {
      addedIdxs.push(i);
    } else if (cur.hash !== hashItem(it)) {
      updatedIdxs.push(i);
    }
  }

  const totalDelta = addedIdxs.length + removedIds.length + updatedIdxs.length;

  /* Noop: nothing observable changed for the index (e.g. sortOrder-only edit,
     lastAccessedAt bump, drift-record change). */
  if (totalDelta === 0) {
    return { deltaType: 'noop', index: currentIndex, affected: [] };
  }

  /* Crossover guard (Q-2): large deltas are cheaper as a full rebuild. The
     threshold compares against add+remove churn, not against update churn,
     because updates are pure O(1) map.set operations that do not perturb
     the entries array length. A bulk-import with 100 new items hits the
     add+remove limit cleanly; a bulk title-rename of 100 items does not,
     and that case is in fact cheaper to patch (100 map.set vs rebuild of
     the full 1 000). */
  if (addedIdxs.length + removedIds.length > BULK_REBUILD_THRESHOLD) {
    const rebuilt = buildIndex(safeNext);
    return {
      deltaType: 'full-rebuild',
      index: makeIndex(rebuilt.entries, rebuilt.byId, currentIndex.generation + 1),
      affected: [],
    };
  }

  /* Patch path: clone the array + map, apply deltas, freeze. */
  const removedSet = new Set(removedIds);
  const prunedEntries = currentIndex.entries.filter((e) => !removedSet.has(e.id));
  const nextById = new Map();
  for (const e of prunedEntries) nextById.set(e.id, e);

  /* Updates overwrite in place in the array (preserve position) + map. */
  const updatedIds = new Set();
  for (const i of updatedIdxs) {
    const fresh = buildEntry(safeNext[i]);
    updatedIds.add(fresh.id);
    nextById.set(fresh.id, fresh);
  }
  /* Array-side in-place overwrite: walk prunedEntries once; if an entry's
     id is in updatedIds, swap it for the fresh entry from the map. */
  const patchedEntries = prunedEntries.map((e) =>
    updatedIds.has(e.id) ? nextById.get(e.id) : e
  );

  /* Appends: tack on new entries at the end. Order is not load-bearing for
     the index — the consumer re-queries items for render order anyway — so
     appending keeps the diff path O(add). */
  const appended = [];
  for (const i of addedIdxs) {
    const fresh = buildEntry(safeNext[i]);
    nextById.set(fresh.id, fresh);
    appended.push(fresh);
  }
  const finalEntries = patchedEntries.concat(appended);

  /* Build the affected list in remove → update → add order so the DOM
     patcher can apply without intermediate invalidation. */
  const affected = [];
  for (const id of removedIds) affected.push({ id, kind: 'removed' });
  for (const i of updatedIdxs) affected.push({ id: String(safeNext[i].id), kind: 'updated' });
  for (const i of addedIdxs) affected.push({ id: String(safeNext[i].id), kind: 'added' });

  return {
    deltaType: 'patch',
    index: makeIndex(finalEntries, nextById, currentIndex.generation + 1),
    affected,
  };
}

/* =========================================================================
   Public: search
   ========================================================================= */

/**
 * Case-insensitive substring match against titleLower OR urlLower.
 * Query is lowercased once; entries are pre-lowercased. The hot loop is
 * two `String.prototype.includes()` calls per entry.
 *
 * Semantics match the B-021 filter contract verbatim — no scoring, no
 * tokenisation, no typo tolerance. The return array contains the matching
 * entries in the order they appear in `index.entries`; the caller maps
 * entries back to items via `_itemById` (sidepanel-side) or by threading
 * the source items array through the search call.
 *
 * @param {SearchIndex} index
 * @param {string} query          raw user query; leading/trailing whitespace handled by caller
 * @returns {SearchEntry[]}
 */
export function search(index, query) {
  if (!index || !index.entries) return [];
  if (!query) return index.entries.slice();
  const q = query.toLowerCase();
  const out = [];
  const entries = index.entries;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.titleLower.includes(q) || e.urlLower.includes(q)) {
      out.push(e);
    }
  }
  return out;
}

/**
 * Convenience: predicate form used by the sidepanel DOM-patch path, where
 * per-row visibility is decided against the current query without
 * materialising a full result array.
 *
 * @param {SearchEntry|undefined} entry
 * @param {string} loweredQuery   already-lowercased
 * @returns {boolean}
 */
export function entryMatches(entry, loweredQuery) {
  if (!entry) return false;
  if (!loweredQuery) return true;
  return entry.titleLower.includes(loweredQuery) || entry.urlLower.includes(loweredQuery);
}
