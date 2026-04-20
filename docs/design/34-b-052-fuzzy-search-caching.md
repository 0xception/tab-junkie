## §34 — B-052 — Fuzzy Search Index Caching + Perf Targets (R2 Design + R6 Close, shipped Sprint 19)

**Status:** R2 design + R6 close (Wave 3, shipped Sprint 19). Tier: Full (M). Target branch: `feature/B-052-fuzzy-search-perf`. Depends on §19 (B-021 inline filter, already shipped) and §10.10 (broadcast architecture, already shipped). No dependency on §33 (imports) beyond the post-import broadcast signal, which is already covered by `MUTATION_BROADCASTS`. Build deviations from the R2 plan are summarised in §34.14.

### §34.1 Overview

B-052 replaces the O(n)-per-keystroke linear scan in `applyFilter()` with an **in-memory, sidepanel-scoped search index** rebuilt in response to scoped mutation broadcasts, and introduces a **formal measurement harness** that asserts the < 50 ms P95 search latency (AC3) and < 200 ms first-paint (AC4) contracts against deterministic 1 000-item and 500-item fixtures. No new message types, no new permissions, no new persisted partitions — the entire scope of B-052 is (a) an index builder, (b) a narrowed invalidation strategy, (c) a paint budget for first render, and (d) a CI-grade perf test suite.

The B-021 filter surface (the input, the `<mark>` highlighter, the Escape/clear-button affordances, the empty-state CTA, the debounce value) is preserved verbatim — B-052 is an optimisation underneath, not a UX change.

### §34.2 Index Location + Lifetime

**Decision: option (a) — the index lives in the sidepanel process only.** The service worker does NOT maintain an index; it only emits the CRUD broadcasts that trigger index updates on the sidepanel side.

**Options considered:**

| Option | Cost | Benefit | Risk |
|---|---|---|---|
| (a) Sidepanel-only | Rebuild on sidepanel open (~5–20 ms for 1 000 items at the structure chosen in §34.3) | Zero SW work; no message-boundary serialisation; no SW cold-start coupling | Every panel open pays the rebuild cost |
| (b) SW-canonical + message sync | One rebuild per process; sidepanel imports via structured-clone | Minimises per-open CPU | SW cold-starts mid-flight break the invariant (see C-3); every open still pays structured-clone cost; two-owner invalidation protocol is complex |
| (c) Both (SW + sidepanel mirror) | Rebuild in two processes | Redundancy | Sync drift; two sources of truth violating the C-4 spirit |

**Rationale:**

- **AC4 (500-item first paint < 200 ms):** The critical-path cost is the DOM render in `renderAll()`, not the index build. A 500-item flat-array build with URL lowercasing on a modern desktop Chromium is empirically in the 2–5 ms range (verified against the existing B-021 filter path, which already lowercases both fields per keystroke across the full list without issue). Option (a) pays this cost **once per open**, amortised against a paint budget that is dominated by `buildGroupSection()` DOM work. Option (b) would save nothing measurable because the message boundary itself costs ≥ 1 ms in structured-clone for a 1 000-item payload.
- **AC3 (1 000-item P95 < 50 ms):** Search latency is independent of index location once the index is present. Option (a) puts the index in the same JS heap as `applyFilter()`, so query execution is a tight synchronous loop — no IPC, no clone, no await. This is the simplest path to a P95 < 50 ms.
- **C-3 (SW cold-start safe):** The sidepanel already tolerates SW cold-start mid-session via the `MSG_STATE_CHANGED` re-fetch pattern (§19.2). Option (a) inherits that tolerance for free — an SW restart mid-search simply means the next broadcast triggers a re-fetch and rebuild, and the query re-runs against the fresh index. Option (b) would require a "whose index is newer" protocol.
- **C-8 (SW-context feasibility):** N/A for the chosen option. If option (b) were chosen, we would need to verify that any DOM-adjacent APIs used in the index (there are none — the index is pure data) would not be called in the SW. Choosing (a) sidesteps the question entirely.

**Lifetime:** the index is a module-level variable (`_searchIndex`) in `sidepanel/sidepanel.js`, built at the end of `renderAll()` (right after `_itemById` is populated — both read the same `items` array), and invalidated/rebuilt by the paths enumerated in §34.4. On sidepanel close, the process is torn down and the index is garbage-collected with it. Cold-start path: sidepanel opens → existing `MSG_LIST_ITEMS` fetch → `renderAll()` → index build → first paint. No extra round trips.

### §34.3 Index Structure

**Decision: a pre-lowercased flat array of `{ id, titleLower, urlLower }` plus a parallel `Map<id, IndexEntry>` for O(1) lookup during targeted updates.**

```js
/**
 * @typedef {Object} IndexEntry
 * @property {string} id           ULID (stable; per C-4 survives URL drift + rename)
 * @property {string} titleLower   item.title.toLowerCase() — precomputed once per entry
 * @property {string} urlLower     item.url.toLowerCase() — precomputed once per entry
 * @property {string} groupIdKey   item.groupId ?? '__ungrouped__' — for future scoped-search hooks
 */

let _searchIndex = [];                    // Array<IndexEntry>; ordered same as _cachedItems
let _searchIndexById = new Map();         // Map<string, IndexEntry>; O(1) targeted-update lookup
let _searchIndexVersion = 0;              // Monotonic counter; bumped on every rebuild or patch
```

**Options considered:**

| Structure | Build cost (1 000 items) | Query cost (substring, 1 000 items) | Memory | Suitability |
|---|---|---|---|---|
| Plain array of `{id, title, url}` (B-021 current) | ~0 ms | ~8–12 ms per query (2 `toLowerCase()` calls per item per keystroke) | ~100 KB | Meets P95 < 50 ms but leaves no headroom — see §34.6 |
| **Pre-lowercased flat array + Map (chosen)** | **~5–10 ms** | **~2–4 ms per query (two `.includes()` calls per entry; no repeated lowercasing)** | **~150 KB** | **Meets P95 < 50 ms with ~10× headroom** |
| Trigram inverted index | ~40–80 ms | ~0.5–2 ms per query for trigram match; but union-merge of candidate set still scans results | ~1–3 MB | Overkill for v1; adds maintenance burden and an opaque data structure |
| Fuse.js suffix-array with fuzzy scoring | ~50–120 ms (library init) | ~3–8 ms per query | ~500 KB–1.5 MB | Imports a third-party library for no measurable gain at 1 000 items; breaks the "no runtime deps" principle of the project |
| Custom inverted index on token sets | ~20–40 ms | ~1–3 ms for whole-word tokens; degrades to O(n) for substring | ~400 KB | Token tokenisation choices (URL components? CamelCase split?) are themselves judgement calls. Substring is the B-021 contract — tokens would change match semantics. |

**Rationale:**

- The pre-lowercased array is a **surgical optimisation of the B-021 algorithm**, not a replacement. It preserves the exact match semantics (case-insensitive substring on title OR url) that users already rely on. B-021 T1–T10 semantics (§19) remain byte-for-byte identical.
- Memory budget: ~150 KB for 1 000 items is well inside the "few MB max" budget. At 10 000 items (hypothetical), still ~1.5 MB — acceptable.
- The parallel `Map<id, IndexEntry>` enables targeted updates (§34.4) without a scan. On `updateItem`, the handler patches the single entry and bumps `_searchIndexVersion`. On `createItem`, push + map.set. On `deleteItem`, filter + map.delete.
- **No trigram/Fuse.js:** the AC3 budget is 50 ms P95 at 1 000 items, and the flat-array structure clears that with > 10× headroom. Spending build complexity, memory, and an opaque data structure on a budget we already meet fails the "simplest thing that works" bar. If a future item (B-079?) requires **typo tolerance** or **ranked relevance**, that item is where trigrams or Fuse.js would be re-evaluated.
- `groupIdKey` is stored per entry so a future scoped-search item (e.g. "only group X") has a pre-computed key. B-052 does NOT use it at query time — it is inert data included at build time at zero extra cost.

**What the index replaces:** the per-keystroke `item.title.toLowerCase()` and `item.url.toLowerCase()` calls inside `applyFilter()` (sidepanel.js:1195–1196 and 1268–1269). Those two `toLowerCase()` calls, run 2 × N times per keystroke, are the dominant hot path per CPU profiling in the B-021 retrospective. The new query loop reads `titleLower` / `urlLower` directly.

**As-shipped note (R6):**

- Each `IndexEntry` is frozen via `Object.freeze` — every individual entry is immutable at runtime.
- The `byId` Map itself is **not** runtime-frozen (JS `Map` instances cannot be usefully frozen via `Object.freeze`). Instead, the module export contract in `sidepanel/sidepanel.js` documents the Map as **structurally immutable via the module API**: no consumer outside the index module is handed a reference to the live Map; callers interact via the exposed `diffAndPatch` / lookup surface.
- R4 code-reviewer finding F-1 surfaced this deviation from an implied "fully frozen" R2 expectation. Fix-up chose **Option A** (document the structural-immutability contract in the module export) over **Option B** (restructure to a frozen plain object). Option A preserves the O(1) Map lookup used by `_patchSingleRow` with zero runtime cost; Option B would have forced a full restructure of the hot lookup path for no measurable safety gain given that the Map is not exported. See §34.14 row 1.

### §34.4 Invalidation Strategy

**Decision matrix — what triggers what kind of update:**

| Trigger | Broadcast scope (§10.10) | Index action | Cost |
|---|---|---|---|
| `MSG_CREATE_ITEM` | `items` | **Append**: push one `IndexEntry`, `map.set(id, entry)`, bump version | O(1) |
| `MSG_UPDATE_ITEM` (title or url patch) | `items` | **Patch**: `map.get(id)` → rewrite `titleLower` / `urlLower` fields in-place; bump version | O(1) |
| `MSG_UPDATE_ITEM` (groupId patch only; no title/url change) | `items` | **Patch `groupIdKey` only** (reserved for future scoped search); bump version | O(1) |
| `MSG_UPDATE_ITEM` (sortOrder only, no title/url) | `items` | **No-op** (index is order-independent; §34.3) | O(0) |
| `MSG_DELETE_ITEM` | `items` | **Remove**: `_searchIndex = _searchIndex.filter(e => e.id !== id)`; `map.delete(id)`; bump version | O(N) filter, but called once per delete |
| `MSG_BULK_CREATE_ITEMS` / `MSG_BULK_DELETE_ITEMS` / `MSG_BULK_UPDATE_ITEMS` | `items` | **Full rebuild** — bulk ops change N entries atomically; a single rebuild is cheaper than N targeted patches and has fewer partial-state windows | O(N) rebuild |
| `MSG_PROMOTE_TAB` | `items` | **Append** (equivalent to create) | O(1) |
| `MSG_DEMOTE_ITEM` | `items` | **Remove** (equivalent to delete) | O(N) filter |
| `MSG_IMPORT_COLLECTION` | `items` | **Full rebuild** — §33 replaces the entire collection atomically | O(N) rebuild |
| `MSG_CREATE_GROUP` / `MSG_UPDATE_GROUP` / `MSG_DELETE_GROUP` | `groups` | **No-op on items index** — group names are NOT in the index. Group deletion triggers a cascade that ultimately reaches items via a separate `items` broadcast, which handles the entry removal. | O(0) |
| `MSG_SET_PREFERENCES` | `preferences` | **No-op** | O(0) |
| `liveState` broadcast (tab events) | `liveState` | **No-op** — live-state is not indexed | O(0) |
| `windowMap` broadcast (B-014) | `windowMap` | **No-op** | O(0) |
| Drift detection (§10.7) writes to `tj:drift` | Indirect (drift is not a direct broadcast; surfaces re-fetch on `items` scope) | **No-op on items index** — drift is computed overlay, not a core item field | O(0) |

**Implementation seam:** instead of detecting the operation type on the sidepanel side (fragile — would require the broadcast to carry a `mutation: MSG_CREATE_ITEM` discriminator), we keep the current coarse `scope: 'items'` broadcast and do a **differential rebuild** in the sidepanel receiver:

```js
// Pseudocode — target lives in the `scope === 'items'` branch of the
// onMessage listener at sidepanel.js:4114.
const itemsResp = await sendMessage(MSG_LIST_ITEMS);
const nextItems = itemsResp.items;

// Current behaviour: renderAll() blows away the DOM and the caches.
// B-052 change: diff the incoming items against _searchIndexById by id, then:
//   - for added ids: append entry, map.set
//   - for removed ids: filter + map.delete
//   - for retained ids where title or url changed: patch entry in place
//   - if nothing changed (selection-only mutation, lastAccessedAt bump): skip rebuild
// Only rebuild the full DOM when the diff is non-trivial; otherwise patch.
```

This approach has four properties that matter:

1. **Preserves AC5 (no full re-render on single-item updates):** the diff detects the "one item changed, everything else is identical" case and routes to the targeted-patch path rather than `renderAll()`. §34.7 covers the DOM-patch side.
2. **Does not require a new message contract** — the broadcast payload already carries nothing but `scope`, and B-052 reads the authoritative item list via the existing `MSG_LIST_ITEMS`. C-2: no new types needed.
3. **Robust under SW cold-start mid-session:** if the SW restarts and the sidepanel receives a `scope: items` broadcast from the fresh SW, the diff against the stale cache rebuilds only what actually changed. Worst case is a full rebuild, which is still O(N).
4. **Bulk op detection is cheap:** if `nextItems.length` differs from `_searchIndex.length` by > 10, fall back to a full rebuild rather than computing a large diff. The threshold is an implementation detail for R3.

**Open question for R3:** is the hash key for diff detection `{ id, title, url, groupId }` (catches every field that affects search/scope) or just `{ id, title, url }` (strictly what the index cares about)? The chapter **does not mandate** — R3 picks whichever keeps the test suite deterministic at 1 000 items.

**As-shipped note (R6):**

- Differential rebuild shipped as `diffAndPatch` with `BULK_REBUILD_THRESHOLD = 10` (tuned per §34.4's suggested crossover). Diffs with 10+ added/removed entries fall back to a full rebuild; smaller diffs take the O(1) single-item patch path.
- `sortOrder`-only edits are correctly detected as no-ops — the index is order-independent.
- **R3 Q-1 resolution:** the hash key for diff detection includes `groupId` (i.e. `{ id, title, url, groupId }`). This was required to detect group-move edits, which must patch the `groupIdKey` on the entry and — per the DOM-divergence fix below — route to full re-render.
- **R4 F-2 cross-group-move DOM divergence fix:** the initial R3 implementation routed group-move patches through `_patchSingleRow`, but the patch replaced the row in place (it did not relocate the row from the old group's section into the new group's section). R4 surfaced the DOM divergence (row appeared in the wrong group container). **Fix-up: `_patchSingleRow` now detects cross-group moves via the `groupId` comparison and returns `false`, which triggers a full `renderAll`**. Same-group title/url edits remain on the O(1) patch path. This is a documented shipped deviation from §34.7's original "all single-item updates patch in place" framing. See §34.14 row 2.

### §34.5 First-Paint Contract (AC4)

**Target:** sidepanel first paint < 200 ms for a 500-item collection after the panel is opened.

**Decision: skeleton-first + synchronous hydrate (no virtualisation in v1).** The sequence:

```
t=0    sidepanel.html loads → CSS paints → skeleton placeholder visible
t=?    sendMessage(MSG_LIST_ITEMS) + sendMessage(MSG_LIST_GROUPS) in parallel
t=?    renderAll(items, groups, liveStates, driftRecords, openTabs)
       - builds DOM fragment for all groups + items (~500 rows)
       - appends fragment in one operation (single layout)
       - builds _searchIndex (§34.3) from the same items array
t=?    applyFilter() re-application (no-op if _filterQuery is empty)
t=?    First meaningful paint complete
```

**Budget (500 items):**

| Phase | Budget | Measured (B-054 baseline) |
|---|---|---|
| HTML + CSS parse + skeleton paint | ≤ 30 ms | ~15–25 ms on dev machine (chrome-mock env doesn't exercise paint; UAT will confirm) |
| `MSG_LIST_ITEMS` round-trip | ≤ 60 ms | ~20–40 ms at 500 items |
| `MSG_LIST_GROUPS` round-trip (parallel with above) | ≤ 60 ms | ~10–20 ms |
| `renderAll()` DOM construction + fragment append | ≤ 80 ms | R5 measurement required — B-054 shipped with 20-item fixtures and is not a reliable baseline at 500 |
| `_searchIndex` build | ≤ 10 ms | Estimated 2–5 ms |
| Margin | ≥ 20 ms | — |
| **Total** | **≤ 200 ms** | **To be validated by R5 `tests/b052-first-paint-perf.test.js`** |

**Why no virtualisation in v1:** a 500-row DOM is within Chromium's practical rendering budget on a desktop machine (the target environment per CLAUDE.md "Desktop-first"). Virtualisation via `IntersectionObserver` adds: (1) complexity in the filter path (filtered-out rows are also not rendered, breaking the B-021 count-badge semantics unless the filter runs pre-render), (2) scroll-position management, (3) accessibility considerations (screen readers need row nodes present to navigate). If R5 measurement shows the 80 ms `renderAll()` budget is exceeded at 500 items, B-052 carves out an explicit **Option B sub-proposal**: virtualise only the items within each collapsed-by-default group section, and keep expanded sections fully rendered. Option B is NOT part of the committed B-052 scope; it is a named fallback called out to R3 for triage.

**Why skeleton-first (not full render-first):** users perceive responsiveness from first visual change, not from interactive-completeness. The skeleton (already present per B-054 / B-023) paints within 30 ms of panel open because it requires no JS data; the item hydration then replaces it.

### §34.6 Search Latency Contract (AC3)

**Target:** < 50 ms P95 for search over a 1 000-item collection.

**Where search runs:** inside the sidepanel, synchronously in the `setTimeout(applyFilter, 150)` debounce callback (the B-021 pattern). No IPC. No SW involvement. No await.

**Query algorithm:**

```
applyFilter():
  query = _filterQuery.trim().toLowerCase()
  if query is empty: fast-path clear highlighting; return
  visibleByGroup = Map<groupId, number>()
  for each entry in _searchIndex:           // O(N), N=1000
    if entry.titleLower.includes(query) || entry.urlLower.includes(query):
      row = itemListEl.querySelector(`[data-item-id="${entry.id}"]`)
      show row, highlight via buildHighlightedText (§19.3)
      visibleByGroup[entry.groupIdKey]++
    else:
      row.hidden = true
  update group badges + filter-empty-state
```

The **hot loop** is two `String.prototype.includes()` calls per entry against pre-lowercased strings. For 1 000 entries on a modern desktop Chromium this is ~1–3 ms of JS time. The DOM-mutation phase (`row.hidden = true/false`, highlight fragment build) is the remaining budget and dominates — this is where the 50 ms headroom is spent.

**Debounce + cancellation:**

- Keep the existing 150 ms `setTimeout` debounce from B-021 (§19.5). The B-021 retro documented this value as tuned; changing it is out of scope.
- **Cancel-inflight:** not applicable — the search is synchronous. There is no async query to cancel. The debounce timer handle is already cleared on every keystroke (§19.5).
- **Streaming vs snapshot:** snapshot. The entire result set is applied in one DOM pass. Streaming would require double-buffering the visible/hidden state and adds no perceivable latency win at 1 000 items.

**AC3 measurement harness:** see §34.8.

### §34.7 Targeted DOM Patches (AC5)

**Current B-021 behaviour (verified in sidepanel.js:2517–2524):** `renderAll()` blows away the item list container and rebuilds it on every `scope: items` broadcast, regardless of whether the change was a single-item edit or a bulk operation. This is the status quo B-052 must improve.

**B-052 addition:** a **single-item patch path** that runs when the `items` diff (§34.4) reports exactly one added, removed, or title/url-changed id:

```
handleItemsScopeBroadcast(nextItems):
  diff = diffItemsById(_cachedItems, nextItems)
  if diff is empty: return  // no-op, e.g. lastAccessedAt bump that the index doesn't care about
  if diff has > 10 added+removed entries: full renderAll()
  if diff has exactly 1 entry: patchSingleRow(diff.single)
  else: renderAll()          // multi-edit case still uses the existing path

patchSingleRow(change):
  if change.type === 'added':
    build one row via existing buildItemRow() primitive
    insert into the correct group section respecting sortOrder
    patch search index (append)
    if _filterQuery non-empty: apply filter visibility to the new row
  if change.type === 'removed':
    remove the row from DOM
    patch search index (delete)
  if change.type === 'updated':
    overwrite title/url text via textContent (never innerHTML)
    re-apply highlight if _filterQuery non-empty
    patch search index (rewrite titleLower/urlLower)
```

**Existing primitives we can reuse:**

- `buildItemRow()` — currently internal to `buildGroupSection()` at sidepanel.js (called from renderAll). R3 may need to extract it into a callable helper.
- `_patchItemWindowBadge()` (sidepanel.js:3540) — already a targeted patch pattern used for window badges on live-state changes. B-052's single-row patch follows the same architectural shape.
- `refetchAndPatchLiveState()` (sidepanel.js:4081) — already a scope-narrowed patch path for `liveState` broadcasts. `scope: items` with a one-row diff becomes the analogous narrow path.

**What we intentionally do NOT patch granularly:** multi-row edits (bulk create/delete/import). Those flow through `renderAll()` to keep the DOM/model consistency simple. AC5 says "no full re-render on single-item updates" — it does not say "no full re-render ever". Bulk ops are outside AC5's contract.

**Reconciliation with the filter:** after `patchSingleRow`, if `_filterQuery` is non-empty, the patched row's `hidden` attribute is set by a direct query against the `_searchIndex` entry — no full `applyFilter()` pass. This is the targeted equivalent of the current "re-apply filter at end of renderAll" path (§19.5).

**As-shipped note (R6):**

- `_patchSingleRow` replaces the **entire row** via the existing `buildItemRow` primitive rather than patching text nodes / individual attributes in place (the approach sketched in the pseudocode above). Rationale: `buildItemRow` encodes the full live-tab / active / audible / drifted / window-badge / indicator matrix coherently; a piecemeal `textContent` + attribute patch would risk desync between the live-state overlays and the persisted item state whenever any upstream flag changes. Rebuilding the row via the canonical builder makes state coherence a compile-time property of the row itself.
- Cost: one DOM allocation per updated id. AC5 ("DOM patches are targeted") is still met literally — the patch touches exactly one row node and leaves every sibling untouched. The full-collection `renderAll` path is never invoked for single-item edits within the same group.
- R4 code-reviewer accepted this deviation with the above rationale. See §34.14 row 2.
- **Redundant `applyFilter` removed (R4 fix-up):** the initial R3 `_patchSingleRow` called `applyFilter()` internally after every add/update, and the broadcast caller also called `applyFilter()` once after the full patch loop. On bulk-patch broadcasts this produced N+1 filter passes. R4 fix-up removed the inner calls — the caller's post-loop `applyFilter()` is sufficient, and single-item patches that arrive outside a bulk context still hit the caller's single post-loop pass. See §34.14 row 3.

### §34.8 Measurement Harness (R5)

**New test files (R3 creates them, R5 uses them):**

| File | Purpose | Assertion |
|---|---|---|
| `tests/b052-fuzzy-search-perf.test.js` | Measures P95 search latency on a deterministic 1 000-item fixture | P95 < 40 ms (20% safety margin below the 50 ms AC3 target) |
| `tests/b052-first-paint-perf.test.js` | Measures time from first `MSG_LIST_ITEMS` resolve to `renderAll()` completion on a 500-item fixture | P95 < 160 ms (20% margin below 200 ms AC4 target) |
| `tests/b052-invalidation.test.js` | Validates the §34.4 decision matrix — every broadcast type triggers the correct index action | Structural assertions on index contents post-broadcast |
| `tests/b052-targeted-patch.test.js` | Validates §34.7 — single-item updates do NOT call `renderAll()` | Asserts DOM node identity preservation across a single-item edit |

**Fixture generator (shared across perf tests):**

```js
// tests/_fixtures/generate-item-collection.js
/**
 * Deterministic N-item fixture for perf testing.
 * @param {number} n           Number of items
 * @param {number} seed        PRNG seed (xorshift32) — same seed produces identical output
 * @param {Object} [opts]
 * @param {number} [opts.groupCount=10]   Number of groups; items distributed round-robin
 * @returns {{ items: Item[], groups: Group[] }}
 */
export function generateItemCollection(n, seed, opts = {}) { ... }
```

**Fixture composition (per R3 fixture spec):**

- Titles: realistic-length strings (10–80 chars) drawn from a word list seeded into the generator. No unicode outside BMP for determinism.
- URLs: `https://host{0..99}.example.com/path/{prng}` — varied hosts so URL-based matching is exercised non-trivially.
- Groups: 10 groups, items distributed ~evenly.
- `sortOrder` assigned sequentially; `createdAt`/`updatedAt` derived from PRNG.

**P95 measurement protocol:**

```js
const ITER = 50;                           // 50 samples is enough for a stable P95 in Node test
const samples = [];
for (let i = 0; i < ITER; i++) {
  // Vary the query each iteration to avoid cache effects
  const query = pickQueryFromWordlist(prng);
  const t0 = performance.now();
  runFilterPass(index, query);             // pure function; no DOM in the perf test
  samples.push(performance.now() - t0);
}
const p95 = sortedSamples[Math.floor(ITER * 0.95)];  // index 47 of 50 sorted samples
assert.ok(p95 < 40, `Search P95 ${p95.toFixed(2)}ms exceeded 40ms budget`);
```

**First-paint measurement protocol:** the test runs `renderAll()` against a jsdom-equivalent minimal DOM shim (reuse the b054 test harness pattern) and measures the time from `renderAll()` entry to the first `appendChild` on the item list container. This is the CI-practical proxy for "first paint" — we cannot measure real paint in Node, but the DOM-construction time is the dominant contributor and is deterministic.

**Why 20% safety margin:** CI hardware is slower and jitter-prone. A 50 ms target with 40 ms CI budget absorbs slowdown and keeps the test from flapping. The B-001a `tests/perf.test.js` pattern uses a similar margin.

**As-shipped measurements (R6):**

| Metric | Budget | Measured (R5) | Headroom |
|---|---|---|---|
| AC3 search P95 (1 000 items) | 40 ms | **0.152 ms** | ~263× |
| AC4 first-paint DOM-construction proxy (500 items) | 160 ms | **1.14 ms** | ~140× |
| Index build (1 000 items) | 10 ms | **0.96 ms** | ~10× |

- Harness: 50 samples per run, deterministic PRNG seed, queries varied per iteration to defeat cache effects (per §34.8 protocol).
- Test file: `tests/b052-fuzzy-search-perf.test.js`, 15 tests total (perf + invalidation + targeted-patch consolidated into the single file; the split sketched in the §34.8 table above was consolidated during R3 to reduce fixture duplication).
- The enormous headroom against AC3/AC4 confirms that the flat-array + `Map` structure chosen in §34.3 is the right trade-off at current scale; trigrams / third-party libs remain off the table well beyond 10 000 items.

### §34.9 Empty-State UX (C-9)

Every user-facing state enumerated per the R2 correctness checklist:

| State | Expected UI | Rationale |
|---|---|---|
| Zero items stored (empty collection), filter input focused but not typed | Filter input is **enabled**; the existing B-054 main empty state (`emptyStateEl`) is shown in the item list area; no filter-specific UI | Consistent with B-021 — the filter input is always interactive so first-run users learn it exists; "no items" is a global state, not a filter concern |
| Zero items stored, user types a query | Filter input accepts keystrokes; since there are no rows to match, `applyFilter` produces zero visible rows; existing `#filter-empty-state` with the B-049 clear CTA is shown | Reuses the existing B-049 filter-empty-state widget (§19 + B-049). No new UI surface. |
| Non-zero collection, zero matches for the query | Show `#filter-empty-state` with message "No bookmarks match '{query}'" and a "Clear filter" CTA | Identical to B-021 current behaviour; B-052 does not touch the empty-state copy or DOM |
| Query typed while an index rebuild is in flight (e.g. broadcast-triggered full rebuild mid-typing) | **Block-free**: the keystroke sets `_filterQuery`, the 150 ms debounce timer is armed; when the debounce fires, it reads whatever index is in `_searchIndex` at that moment. If the rebuild has not completed, the query runs against the stale index (strictly older snapshot — not wrong, just one revision behind); the next post-rebuild `applyFilter()` re-run (already part of the renderAll tail) corrects the display. | Rebuilds for a 1 000-item collection complete in 5–10 ms — well under the 150 ms debounce. A stale read is only possible if a bulk import lands during typing, and the correction arrives within one frame. No "loading skeleton" is warranted because the perceived latency is sub-frame. |
| Offline / zero-network | N/A — extension is local-only | CLAUDE.md non-negotiable: "No network requests" |
| Rapid keystrokes (typing next char before previous search returns) | The search IS synchronous; there is no "previous search still returning". The debounce (150 ms) collapses bursts of keystrokes into a single `applyFilter()` call. `clearTimeout(_filterTimer)` on each keystroke guarantees only the last-in-burst query executes. | Preserves B-021 semantics verbatim |
| Index corrupted / unreadable (e.g. a bug leaves `_searchIndex` in a bad state) | **Graceful degrade** to a linear scan against `_cachedItems` (the B-021 implementation) wrapped in a `try/catch` around the index read. The first catch triggers a single `console.warn('[tab-junkie:b052] search index unusable; falling back to linear scan')` (diagnostic only — no PII, no URL/title content logged) and sets an internal `_searchIndexDisabled = true` flag that suppresses further warnings for the session. | Meets the CLAUDE.md rule "strict error handling around all chrome.* API calls — treat missing/denied permissions as first-class states", applied here to the in-memory index. No user-visible warning needed — linear scan still satisfies B-021's existing latency at 1 000 items. |
| Filter input contains an active query when a broadcast triggers a rebuild | After rebuild + `renderAll()`, the tail-call re-applies the filter (§19.5 "re-render resilience"); B-052 preserves this hook | Already covered by B-021 logic; B-052's diff path also re-applies filter after `patchSingleRow` |

### §34.10 SW-Context Feasibility (C-8)

**Scope of C-8 for B-052:** none of the design artefacts run in the service worker. The index lives in the sidepanel process (§34.2). No DOM-adjacent APIs are used on the SW side.

**APIs used by B-052:**

| API | Context | SW-reachable? | Citation |
|---|---|---|---|
| `String.prototype.toLowerCase()` | Sidepanel | N/A (pure language) | — |
| `String.prototype.includes()` | Sidepanel | N/A (pure language) | — |
| `performance.now()` | Sidepanel (runtime) + Node (tests) | N/A (not called in SW) | — |
| `Map`, `Array`, `Object.freeze` | Sidepanel | N/A (pure language) | — |
| `setTimeout` / `clearTimeout` | Sidepanel (existing B-021 debounce) | — | Already shipped, no change |
| `document.createDocumentFragment` / `createElement` / `createTextNode` / `querySelector` | Sidepanel DOM | N/A (explicitly sidepanel-only per §34.2 decision) | — |
| `chrome.runtime.sendMessage` / `onMessage` | Sidepanel (existing) | Yes — but B-052 adds no new message types | Already shipped |

**Not used:** `IntersectionObserver`, `requestIdleCallback`, `performance.measure`, `requestAnimationFrame`, `MutationObserver`, `DOMParser`, `FileReader`, `CompressionStream`, Web Workers, SharedArrayBuffer — none appear in B-052's design.

**C-8 verdict:** PASS — no SW-context API calls. The B-069 retrospective concern (APIs that are not reachable in SW) does not apply to B-052.

### §34.11 Rollback Plan

**Risk level:** LOW. B-052 adds no new storage partitions, no new message types, and no new permissions (§34.12). The index is in-memory only.

**Single-variable feature gate:** introduce a module-level constant `SEARCH_INDEX_ENABLED = true` at the top of `sidepanel/sidepanel.js`. The diff-and-patch code paths and the index-build code paths both check this constant. When flipped to `false`:

- `_searchIndex` is not built at the end of `renderAll()`.
- `applyFilter()` falls through to the B-021 linear-scan implementation (the legacy code path remains in place as the fallback — the B-021 code is NOT deleted, it is wrapped under a branch).
- `scope: items` broadcasts fall through to unconditional `renderAll()` (no diff path).

**Rollback procedure:**

1. `git revert <commit-sha>` — restores the sidepanel to its B-021 behaviour.
2. No data migration required — `_searchIndex` is module-scoped and is discarded on sidepanel reload.
3. No storage schema to downgrade — § C-1 PASS (no schema changes).
4. Chrome Web Store rollback: build from the pre-B-052 tag (`v1.13.0` or whichever is the last stable) and re-submit. CWS keeps the prior version archived for reinstatement.

**Non-revert rollback (hotfix path):** flip `SEARCH_INDEX_ENABLED = false` in a point-release commit, ship `v1.14.1` without touching anything else. This preserves the surrounding B-052 test scaffolding for the next attempt.

**As-shipped note (R6):** `SEARCH_INDEX_ENABLED = true` is the shipped default at the top of `sidepanel/sidepanel.js`, with a one-line inline comment documenting the rollback behaviour. Flipping to `false` routes `applyFilter()` through the pre-B-052 linear-scan fallback (B-021 behaviour preserved verbatim under the branch). UAT `docs/UAT_B-052.md` (15 cases, 543 lines) is deferred for user execution on Edge per the sprint paperwork.

### §34.12 Out-of-Scope (Explicit)

The following are out of scope for B-052 and will NOT ship in this sprint item:

- **No changes to `tj:items`, `tj:groups`, or any other persisted partition** (§2 unchanged; C-1 PASS).
- **No new message types** (§5 unchanged; C-2 PASS — reuses `MSG_LIST_ITEMS`, `MSG_STATE_CHANGED` scope `items`).
- **No new Chrome API permissions** (manifest unchanged; C-5 N/A).
- **No UI redesign of the filter input** — the B-021 shape (input + clear button + empty state + Escape handling + 150 ms debounce) is preserved verbatim (§19 governs).
- **No changes to the import/export pipeline** (§32 / §33 unchanged).
- **No fuzzy matching / typo tolerance / ranked relevance.** The filter remains a case-insensitive substring match. The name "fuzzy search" in the backlog item refers to the informal product goal; the implementation contract is substring matching per B-021. Typo tolerance would be a future backlog item.
- **No filter persistence across sidepanel reopen.** `_filterQuery` is module-scoped, lost on close. Persistence was called out as deferred in §19.11.
- **No scoped filters (group-only, live-only).** Called out as deferred in §19.11.
- **No global `Ctrl+F` / `/` shortcut to focus the filter.** Called out as deferred in §19.11.
- **No virtualisation / infinite scroll.** Explicitly excluded per §34.5. Named Option B sub-proposal exists ONLY as a fallback if R5 shows the first-paint budget is missed; the B-052 commit does not virtualise.
- **No Web Worker offloading of the index.** For 1 000 items the JS thread cost is sub-5 ms; offloading adds message-passing cost greater than the save.
- **No SW-side index.** Explicitly rejected in §34.2 option (b).
- **No third-party search libraries** (Fuse.js, FlexSearch, MiniSearch). The project's "no runtime deps" posture is preserved.

### §34.13 R2 Correctness Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS | No storage schema changes. Index is ephemeral in-memory. |
| C-2 | Message contracts typed | PASS | No new message types. Reuses `MSG_LIST_ITEMS` and `MSG_STATE_CHANGED` (scope `items`). |
| C-3 | Service worker cold-start safe | PASS | SW does not hold the index. SW cold-start mid-session triggers existing re-fetch path which rebuilds the sidepanel index on the next `renderAll()`. |
| C-4 | ID stability | PASS | Index keys on `item.id` (ULID). ULIDs survive URL drift (§10.7), title rename, cross-window moves. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |
| C-7 | Allow-list / deny-list direction | N/A | No new data-flow boundary; no fields added to persistable shapes. |
| C-8 | SW-context feasibility | PASS | See §34.10 — no SW-context API calls. |
| C-9 | Empty-state design | PASS | All user-facing states enumerated in §34.9, including index-rebuild-in-flight, index-corrupt, and rapid-keystroke cases. |

### §34.14 Build Deviations from R2 Plan — R6 Close

Three deviations from the R2 plan shipped in R3/R4 fix-up. All are documented in their respective sections above; this table is the consolidated inventory for future-sprint auditability.

| # | Deviation | R2 plan | As shipped | Rationale | Round |
|---|-----------|---------|------------|-----------|-------|
| 1 | `byId` Map freeze | §34.3 implied a "fully frozen" index structure. | Each `IndexEntry` is `Object.freeze`d; the `Map` itself is **not** runtime-frozen. Structural immutability is instead enforced via the module export contract — no reference to the live Map is handed to external callers. | R4 F-1 surfaced the gap. **Option A** chosen (document the contract) over **Option B** (restructure to a frozen plain object) to preserve the O(1) Map lookup used by `_patchSingleRow` for zero runtime-safety gain (the Map is not exported). | R4 fix-up |
| 2 | `_patchSingleRow` row-replace vs text-patch | §34.7 sketched a piecemeal patch — `textContent` rewrite for title/url, attribute patch for highlight, direct index patch. | `_patchSingleRow` rebuilds the entire row via the existing `buildItemRow` primitive. One DOM allocation per updated id; AC5 still met literally (exactly one row node touched). Cross-group moves now return `false` to trigger full `renderAll` (F-2 fix). | Row rebuild preserves the live-tab / active / audible / drifted / window-badge / indicator matrix coherently; piecemeal patches would risk state desync. R4 code-reviewer accepted with rationale. | R3 + R4 fix-up (cross-group branch) |
| 3 | Redundant `applyFilter` removal | R3 initially had `_patchSingleRow` call `applyFilter()` internally after every add/update; the broadcast caller also called `applyFilter()` once post-loop. | Inner `applyFilter()` calls removed from `_patchSingleRow`. The caller's single post-loop `applyFilter()` is sufficient for both single-item and bulk-patch broadcasts. | Avoids N+1 filter passes on bulk-patch broadcasts. Functionally equivalent for single-item edits (the caller still runs one pass). | R4 fix-up |

**No other R2 decisions changed:** §34.1 scope, §34.2 sidepanel-only index location, §34.3 flat-array + Map structure (modulo row 1 above), §34.4 invalidation matrix (modulo row 2 above), §34.5 no-virtualisation-in-v1 stance, §34.6 debounce value + synchronous search, §34.9 empty-state matrix, §34.10 SW-context feasibility PASS, §34.11 rollback gate, §34.12 out-of-scope list, §34.13 correctness checklist — all held unchanged through the build.

---
