# UAT — B-052 Fuzzy Search Index Caching & Perf Targets

Sprint 19 · Full tier (M) · Round 5 UAT plan · version-target v1.14.0

> **STATUS: DEFERRED** — user-executed UAT, same carry-over pattern as B-042,
> B-043, B-048, B-029, B-059, B-044, B-045. Filed in Sprint 19 R5, executed
> by the user against an unpacked build in Edge. Not a blocker to sprint
> close per established policy.

Related artefacts:
- `docs/BACKLOG.md` — B-052 row (5 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §34` — R2 design (fuzzy-search architecture, cache
  invalidation matrix, C-8/C-9 additions)
- `docs/SPRINT_FINDINGS.md` — Sprint 19 B-052 code / security / qa-reviewer
  findings + R4 fix-up pass (F-1 cross-group move, F-2 byId contract, F-3
  broadcast-dispatch routing)
- `sidepanel/search-index.js` — pure index module (buildIndex / diffAndPatch /
  search / BULK_REBUILD_THRESHOLD)
- `sidepanel/sidepanel.js` — `_patchSingleRow`, broadcast-dispatch wiring,
  `SEARCH_INDEX_ENABLED` rollback flag (§34.11)
- `tests/b052-fuzzy-search-perf.test.js` — 18 automated regressions (13 R3
  + 2 R4 fix-up + 3 R5 gap-fillers)

**Baseline test suite**: 955 pass / 0 fail (937 prior-sprint baseline + 18
B-052 tests).

**Engineer-measured perf (reference, not a UAT assertion)**:
- Search P95 (1 000-item index): 0.152 ms (budget 40 ms; product target 50 ms).
- First-paint DOM-build proxy (500 items): 1.14 ms (budget 160 ms; product
  target 200 ms).
- Index build (1 000 items): 0.96 ms (budget 30 ms).

---

## Setup

1. Load the unpacked extension from the repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select
     repo root.
   - Chrome (fallback): `chrome://extensions` → Developer Mode on →
     "Load unpacked" → select repo root.
2. Open the Tab Junkie side panel.
3. For the perf-heavy cases (UAT-1, UAT-2, UAT-5, UAT-6) seed a large
   collection via the appendix-A Node fixture script OR let the script write
   a `chrome.storage.local` payload directly (see Appendix A + B). A
   1 000-item fixture is sufficient for UAT-1; UAT-2 needs a 500-item
   fixture.
4. Make sure you have at least three groups configured before starting
   UAT-4 / UAT-7 / UAT-11 (e.g. `Work`, `Reading`, `Music`).
5. Run the full UAT in BOTH light and dark themes where the case says
   "both themes".

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation from
expected · **WARN** = behaves correctly but surfaced a concern · **SKIP**
= unable to execute (document why).

---

## AC Coverage Summary

| AC | Description | Automated tests | UAT cases |
|----|-------------|-----------------|-----------|
| AC1 | Index built once + cached | `index build < 30ms (sanity)`; `buildIndex(newItems) never returns stale cached index` | UAT-1, UAT-10 |
| AC2 | Invalidation on CRUD | 5-scenario matrix (edit, add, delete, group-move, sortOrder-noop, bulk → full-rebuild); `bulk → subsequent single-edit returns to patch path` | UAT-5, UAT-6, UAT-7 |
| AC3 | < 50 ms P95 on 1 000 items | 50-sample perf P95 `< 40ms` (20 % safety margin); `search result matches linear scan byte-for-byte at 1 000 items` | UAT-1, UAT-14 |
| AC4 | < 200 ms first paint at 500 items | 500-item DOM-build proxy + index rebuild `< 160ms` (20 % safety margin) | UAT-2 |
| AC5 | No full re-render on single updates | single-item patch swaps one row; cross-group move triggers full rebuild not in-place; composite cross-group + same-item edit composite | UAT-3, UAT-4, UAT-11 |

---

## Test Cases

### UAT-1: Instant filter at 1 000 items (AC3)
Covers AC3 — < 50 ms P95 on a 1 000-item collection.

**Steps**:
1. Load the 1 000-item seed (Appendix A).
2. Open the side panel. Wait for first render.
3. Focus the filter input.
4. Type a multi-character query rapidly (e.g. `dash`, `proj`, `admin`),
   backspace, type another.
5. Observe list update cadence.

**Expected**:
- Results update visibly with every keystroke; no typing lag perceptible.
- No spinner, no "loading…" placeholder, no stale-results flash.
- Zero-match queries show the empty-state view (see UAT-8).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: First paint at 500 items (AC4)
Covers AC4 — < 200 ms first paint on a 500-item collection.

**Steps**:
1. Load the 500-item seed (Appendix B).
2. Close the side panel.
3. Open the side panel.
4. Watch the first paint frame.

**Expected**:
- Items visible within ~0.2 s of side-panel open.
- A skeleton flash < 200 ms is OK.
- A blank-screen delay > 1 s is a FAIL.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Single-item title edit — targeted DOM patch (AC5)
Covers AC5 — no full re-render on single updates.

**Steps**:
1. With filter empty, pick any saved item.
2. Right-click → "Edit title" (or the equivalent UI path).
3. Change the title and save.

**Expected**:
- Row updates in place with the new title.
- The list does NOT flash or scroll-jump.
- Other rows keep their identity — scroll position and selection model
  preserved.
- In DevTools Elements, the total `#item-list .item-row` node count before
  and after is identical.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Group-move patch fallback (AC5 + R4 F-1)
Covers AC5 + the R4 F-1 fix — `_patchSingleRow` falls through to
`renderAll` when an item's `groupId` changes.

**Steps**:
1. Ensure you have at least two groups with items in each.
2. Right-click an item in Group A → "Move to group…" → pick Group B.
3. Watch the list during the move.

**Expected**:
- List re-renders; the moved item appears under Group B, NOT under Group A.
- No "ghost row" — the item does not briefly render in both groups.
- No partial-render artifact (row stranded under old group's header).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Bulk import triggers full rebuild (AC2)
Covers AC2 — invalidation via the bulk-import path (delta > BULK_REBUILD_THRESHOLD).

**Steps**:
1. Import a JSON backup with ≥ 50 items (use a prior export from B-043, or
   generate via Appendix A and hand-copy to a JSON file).
2. Confirm the import preview dialog (counts shown).
3. Click Confirm.

**Expected**:
- Preview dialog shows item/group counts.
- After confirm, the list renders ONCE — no per-item flicker or staggered
  paint.
- Search works immediately against the newly imported items (type a title
  substring — the item appears in results).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Rapid single-item edits batched (AC2 + R4 F-3)
Covers AC2 + the R4 F-3 fix — broadcast-dispatch batches multiple single-item
deltas.

**Steps**:
1. Select 5+ items via multi-select (Ctrl/Cmd+click, or Shift+click range).
2. Use bulk-delete (context menu → Delete, or the bulk-action bar).

**Expected**:
- All deletions commit.
- The list updates ONCE, not per-delete. No flicker stack of 5 consecutive
  renders.
- Filter still works against the post-delete item set.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Filter + invalidation coherence (AC2)
Covers AC2 — a single-item edit updates the index, and the active filter
reflects the new state on the next render tick.

**Steps**:
1. Pick any common word used in multiple item titles (say `report`).
2. Type `report` into the filter — 3+ rows match.
3. Right-click one matching row → "Edit title" → change the title so it
   no longer contains `report`.
4. Watch the filtered view.

**Expected**:
- The edited row disappears from the filtered view after save.
- Other matching rows remain.
- No flash of the full list between the edit and the filter re-apply.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Zero-match empty state (C-9 — empty/loading/error states)
Covers AC3 + C-9 — zero-match query must show a sane empty state.

**Steps (both themes)**:
1. With any non-empty collection loaded, focus the filter input.
2. Type a gibberish query that matches no item (e.g. `zxqvwpqz`).

**Expected**:
- Empty state message is visible — `No items match "<query>"` or
  equivalent, with a "Clear filter" CTA or similar escape hatch.
- Contrast is OK in both themes (no white-on-white or low-contrast text).
- No crash, no JS error in the DevTools console.
- Clearing the filter restores the full list.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Empty collection (C-9 — empty state)
Covers C-9 — empty-collection state with B-052 active.

**Steps**:
1. Fresh install OR delete all bookmarks via Settings (or `chrome.storage.local.clear` from the service-worker console).
2. Open the side panel.
3. Focus the filter input and type anything.

**Expected**:
- Empty-collection state shown (typical "no saved items yet" placeholder +
  CTA).
- Search input is still enabled — typing does NOT throw.
- Typing into the filter shows an empty-collection or zero-match state,
  NOT a broken UI.
- DevTools console has no uncaught errors from the index build path.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Rollback gate (C-9 + §34.11)
Covers the §34.11 rollback procedure — setting `SEARCH_INDEX_ENABLED = false`
must cleanly revert to the linear-scan filter path.

**Developer-only — requires editing source and reloading the unpacked
extension. Skip if you are not in a dev environment.**

**Steps**:
1. Open `sidepanel/sidepanel.js`.
2. Find the `SEARCH_INDEX_ENABLED` flag (§34.11).
3. Flip it to `false`.
4. `edge://extensions` → reload the extension.
5. Open the side panel and type filter queries.

**Expected**:
- Filter still works identically (linear scan fallback).
- No user-visible change in behaviour, filtering accuracy, or empty-state
  presentation.
- No console errors.
- Restore `SEARCH_INDEX_ENABLED = true` and reload before continuing the
  UAT plan.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Keyboard navigation preservation (AC5)
Covers AC5 — existing B-021 / B-048 keyboard behaviour must not regress
when the patch path runs.

**Steps**:
1. Tab into the side panel, focus an item row via arrow keys.
2. Trigger an edit on that row (Enter → rename, or context-menu equivalent).
3. Save.

**Expected**:
- Keyboard focus is preserved on the patched row OR is sensibly restored
  (e.g. to the row above, if the edit changed sort order).
- No focus loss into `<body>` after the patch.
- Arrow navigation continues to work immediately after the patch.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: Dark + light theme parity
Covers no B-066 / B-052 theming regression.

**Steps**:
1. Switch the side panel to LIGHT theme.
2. Re-run UAT-1 and UAT-8 steps.
3. Switch to DARK theme (system dark + extension theme = `system`, OR
   extension theme = `dark`).
4. Re-run UAT-1 and UAT-8 steps.

**Expected**:
- Filter input, matched-row highlight (if any), empty-state view all
  render correctly in both themes.
- No color-contrast regression.
- No dark-theme-specific crash or pathological redraw.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Cross-window consistency (bonus)
Covers the items-changed broadcast → every open sidepanel updates its
cached index.

**Steps**:
1. Open the side panel in window A.
2. Open a second browser window, then open the side panel in window B.
3. In window A, edit a bookmark title.
4. Watch window B.

**Expected**:
- Window B's list shows the new title without requiring a manual refresh.
- A filter active in window B still works against the freshly updated
  index.
- No duplicated row, no stale row, no ghost row in window B.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Performance on the user's actual collection (optional)
Covers AC3 real-world "feel" vs measured P95.

**Steps**:
1. Open the side panel against the user's actual Tab Junkie collection
   (not a seeded fixture). Note the approximate item count.
2. Type filter queries across several keystroke bursts.
3. Note any query that feels laggy.

**Expected**:
- Search feels snappy on the user-tested collection size.
- No pathological query (a specific substring that is 10× slower than
  others) surfaces.
- If any query feels laggy: WARN and record the query + approximate item
  count — route to the next sprint as a follow-up spike.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: Test-suite sign-off
Covers the Gate 2 regression guard.

**Steps**:
1. From the repo root, run `npm test`.
2. Wait for the full suite to complete.

**Expected**:
- `tests 955 / pass 955 / fail 0` (or whatever the current post-R5 count
  is — do NOT accept a lower pass count than 955).
- No `skipped` or `todo` entries related to B-052.
- Total runtime within a reasonable envelope (< 10 s on a modern laptop).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Instant filter at 1 000 items (AC3) | |
| 2 | First paint at 500 items (AC4) | |
| 3 | Single-item title edit — targeted patch (AC5) | |
| 4 | Group-move patch fallback (AC5 + R4 F-1) | |
| 5 | Bulk import triggers full rebuild (AC2) | |
| 6 | Rapid single-item edits batched (AC2 + R4 F-3) | |
| 7 | Filter + invalidation coherence (AC2) | |
| 8 | Zero-match empty state (C-9) | |
| 9 | Empty collection (C-9) | |
| 10 | Rollback gate `SEARCH_INDEX_ENABLED = false` (§34.11) | |
| 11 | Keyboard navigation preservation (AC5) | |
| 12 | Dark + light theme parity | |
| 13 | Cross-window consistency (bonus) | |
| 14 | Perf on user's actual collection (optional) | |
| 15 | `npm test` sign-off | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any of UAT-1, UAT-2, UAT-3, UAT-4, UAT-5, UAT-6, UAT-7, UAT-8, UAT-9,
UAT-11, UAT-12, or UAT-15 land FAIL, B-052 returns to the
[frontend-engineer] per Gate 3 — do not mark the sprint item done.
UAT-10 may be SKIPPED by a non-developer user. UAT-13 may be SKIPPED if
only one window is practical. UAT-14 is optional and may WARN without
blocking sprint close — any WARN here gets filed as a backlog follow-up.

---

## Appendix A — 1 000-item fixture generator (Node)

Save as `scripts/uat-b052-seed-1000.js` and run with `node
scripts/uat-b052-seed-1000.js > uat-b052-1000.json`. The fixture mirrors
the `generateItemCollection` helper used by the automated perf tests (same
Mulberry32 PRNG, same word pools) so the seed is byte-identical between
test runs and UAT runs.

```js
// uat-b052-seed-1000.js — mirror of tests/b052-fuzzy-search-perf.test.js fixture
function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TITLE_WORDS = [
  'dashboard','analytics','settings','profile','admin','search',
  'console','billing','invoice','report','archive','template',
  'project','team','workspace','calendar','notes','kanban',
  'roadmap','release','backlog','sprint','issue','review',
  'document','collection','library','bookmark','reference','guide',
];
const URL_HOSTS = [
  'github.com','gitlab.com','example.com','docs.example.com',
  'notes.example.com','search.example.com','admin.example.com',
  'kanban.example.com','wiki.example.com','archive.example.com',
];
const URL_PATHS = [
  'dashboard','settings','profile','search','billing',
  'report','archive','project','team','workspace',
];
const N = 1000;
const SEED = 4242; // matches AC3 perf test seed
const GROUP_COUNT = 10;
const prng = mulberry32(SEED);
const groups = [];
for (let g = 0; g < GROUP_COUNT; g++) {
  groups.push({ id: `grp-${g}`, name: `Group ${g}`, sortOrder: g });
}
const items = [];
for (let i = 0; i < N; i++) {
  const wA = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
  const wB = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
  const wC = TITLE_WORDS[Math.floor(prng() * TITLE_WORDS.length)];
  const host = URL_HOSTS[Math.floor(prng() * URL_HOSTS.length)];
  const path = URL_PATHS[Math.floor(prng() * URL_PATHS.length)];
  const hostNum = Math.floor(prng() * 100);
  items.push({
    id: `itm-${i.toString().padStart(6, '0')}`,
    title: `${wA} ${wB} ${wC} ${i}`,
    url: `https://host${hostNum}.${host}/${path}/${i}`,
    groupId: groups[i % GROUP_COUNT].id,
    sortOrder: i,
    createdAt: 1700000000000 + i,
    updatedAt: 1700000000000 + i,
  });
}
process.stdout.write(JSON.stringify({ groups, items }, null, 2));
```

**To load into Tab Junkie**: Use the B-045 JSON import path on the
generated file, OR paste the JSON into the service-worker DevTools console
and write directly to `chrome.storage.local` under the shape matched by
`background/storage/partitions.js` (developer path — not for normal users).

---

## Appendix B — 500-item fixture generator (Node)

Identical to Appendix A but with `const N = 500;` and `const SEED = 5353;`
— matches the AC4 first-paint test seed. Save as
`scripts/uat-b052-seed-500.js`.

```js
// Identical to uat-b052-seed-1000.js except:
const N = 500;
const SEED = 5353; // matches AC4 perf test seed
// (everything else unchanged — copy the body of Appendix A)
```

---

## Appendix C — Rollback gate dev-toggle instructions (UAT-10)

The rollback flag is a compile-time constant named `SEARCH_INDEX_ENABLED`
in `sidepanel/sidepanel.js`. Per §34.11, flipping it to `false` routes all
filter input through the pre-B-052 linear-scan path.

**Toggle OFF procedure**:
1. Open `sidepanel/sidepanel.js`.
2. Search for `SEARCH_INDEX_ENABLED`.
3. Change `const SEARCH_INDEX_ENABLED = true;` to `const SEARCH_INDEX_ENABLED = false;`.
4. Save.
5. `edge://extensions` → click the Reload button on the Tab Junkie card.
6. Re-open the side panel.

**Toggle ON procedure** (after UAT-10 completes):
1. Revert the change in `sidepanel/sidepanel.js` (back to `true`).
2. Reload the extension.
3. Confirm filtering still works (e.g. re-run UAT-1 quickly).

**Rollback scenarios** (informational):
- A SEV-2 perf regression surfaced post-release → ship a patch that flips
  the flag to `false` while the root cause is investigated.
- A correctness divergence between the indexed path and the linear-scan
  path → flag disables the index; users see identical filter behaviour
  via the fallback.

---

## Deferral Note

This UAT plan is filed DEFERRED under the same Sprint-18/19 carry-over
policy that covers B-042, B-043, B-048, B-029, B-059, B-044, B-045 —
user-executed UAT is scheduled at the start of the next sprint (or as a
standalone burndown session). Gate 3 defers until the user executes the
plan and records the results in this file.

Completion of B-052 for the Sprint 19 close is based on:
- ✅ All 955/955 automated tests passing (Gate 2).
- ✅ All R4 CRITICAL/HIGH findings resolved (Gate 1).
- ⏸️ UAT deferred — user runs this plan out-of-band.
