# Current Sprint

## Sprint 44 — B-148 interleave (CLOSED 2026-05-21)

**Tier:** Spike-First (XL with full R0 spike → R1 → R2 → R3 → R4 → R5 → R6 → R7)
**Release:** v1.39.0 — manifest + CHANGELOG + RELEASES committed at `299e147`; release/v2 tag pending product-owner approval. Currently staged on branch `feature/sprint-44-interleave` (36 commits ahead of release/v2 / v1.38.1 baseline).
**Branch:** `feature/sprint-44-interleave` (branched off release/v2; PR not yet opened — pending tag).

Sprint 43 was already closed on 2026-05-02 (v1.37.0 + v1.37.1 + v1.38.0 + v1.38.1 + v1.38.2 sequence on release/v2) — its content remains under `docs/SPRINT_ARCHIVE.md` "## Sprint 43 — Drag/drop + claim-drift reliability investigation" and is not re-archived here.

---

## Completed This Sprint

### [B-148] Interleave floating tabs with saved bookmarks via group `renderOrder`
- **Tier:** Spike-First (XL)
- **Status:** done ✅
- **Released in:** v1.39.0
- **Files changed (key):**
  - `background/storage/shapes.js` — schema v6 → v7; `isGroup` validator extended for optional `renderOrder: string[]`
  - `background/storage/migration.js` — `KNOWN_VERSION` 6 → 7; `defaultShape(PARTITION_META).schemaVersion` paired bump (C-1a)
  - `shared/render-order.js` — new pure resolver `resolveRenderOrder(group, items, floatingMembers) → RenderRow[]`; bootstrap fallback when `renderOrder` missing/empty; stale-ref filtering
  - `background/storage/items.js` — `createItem`, `deleteItem`, `updateItem({groupId})`, `bulkCreateItems`, `bulkDeleteItems`, `bulkReorderItems` (hotfix) all stamp `renderOrder` in same `writeTransaction`
  - `background/storage/floating-groups.js` — `appendFloatingGroup`, `moveFloatingTab`, `pruneFloatingGroupsByLiveTabId`, `pruneFloatingGroupsByParentItemId` all stamp `renderOrder`
  - `background/messages/storage-handlers.js` — `MSG_REORDER_FLOATING_MEMBERS` accepts `renderOrder` payload; `commitImport` (replace mode) bootstraps `renderOrder` per imported group
  - `background/index.js` (or equivalent cold-start hook) — `bootstrapAndSweepRenderOrder()` derives `renderOrder` for every legacy v6 group on first SW boot
  - `sidepanel/sidepanel.js` — render path consumes `resolveRenderOrder`; drag hit-test extended to enumerate ALL `.item-row` rows in the floating zone (mixed-type drops); multi-select REORDER_FLOATING moves selected siblings as a contiguous block; broadcast fast-path skips `renderAll` when only `renderOrder` changed; `patchFloatingMembersSections` preserves in-container row positions on fast-path; `window.blur` clears multi-selection
  - `newtab/newtab.js` — render path consumes `resolveRenderOrder`
- **R0 spike output:** `docs/findings/sprint-44.md` (or per-sprint slice) — confirmed (A) `writeTransaction` multi-partition atomicity, (B) `renderOrder` on Group is canonical (not a third partition), (C) drop dispatcher emits `{groupId, renderOrder: string[]}` for REORDER_FLOATING.
- **Migration:** lazy v6 → v7 — existing profiles continue working; extension toggle OFF→ON in `edge://extensions` required after update to flush SW module cache (per C-1a). First cold-start `bootstrapAndSweepRenderOrder` derives `renderOrder` for every group.
- **Rollback:** downgrade to v1.38.x NOT supported — `tj:meta.schemaVersion` will be ahead of older `KNOWN_VERSION`; older build safe-modes the partition. Manual recovery: in SW console, `await chrome.storage.local.set({'tj:meta': { schemaVersion: 6, createdAt: Date.now() } })`. Documented in CHANGELOG v1.39.0.
- **Polish / hotfix rounds folded under B-148 umbrella (post-initial-ship, all on same branch):**
  - `dd2ace2` — opener-chain inheritance anchors new tab UNDER the opener page (not just at end of group)
  - `7acdc46` — multi-drop visual selection desync (DOM-sweep approach)
  - `f96662a` — bulkReorderItems updates Group.renderOrder (saved-bookmark drag was a silent no-op)
  - `500fcc8` — saved bookmarks drop into floating zone (bidirectional interleave)
  - `619477a` — off-by-one in floating-tab drag direction (coordinate-frame mismatch)
  - `bf3940d` — multi-drop selection Set sync (DOM stays selected, Set empty)
  - `0ff4ce3` — sidepanel `window.blur` clears multi-selection
  - `51f0db6` — `patchFloatingMembersSections` preserves interleaved order on fast-path
  - `6ab19cf` — REORDER_FLOATING moves selected siblings as a contiguous block
  - `db8f13e` — sidepanel broadcast fast-path skips `renderAll` when only Group.renderOrder changed
- **Test count:** 1930 → 2006 PASS (+76 net)
- **UAT:** product-owner real-world (Edge) — all interleave / multi-drop / opener-chain / scroll-and-drop scenarios confirmed PASS; 5 follow-on items filed from observations (see below).

### B-162..B-166 — Backlog filings during S44 close-out (docs-only, no code shipped this sprint)
These are user-story rows filed in `docs/BACKLOG.md` during S44 close-out from product-owner observations and architectural review of the `tj:drift` data model. All five are R1 PENDING and scheduled for S45+ triage. No code committed against any of them in S44.

- **B-162** (P3 / M) — Ctrl+Shift+T reopen lands restored tab back in original group (commit `ed6dbe0`)
- **B-163** (P2 / M) — drift URL as fallback match candidate on cold-start re-association (commit `6cd7762`)
- **B-164** (P1 / M) — saved-bookmark→tab claims should survive system sleep / lid-close (commit `a2d75a6`)
- **B-165** (P2 / M) — sidepanel list should keep scroll position after drag-drop into a group (commit `5e5084e`)
- **B-166** (P2 / S) — `+` CTA on floating tab should promote in-place, not append to end of group (commit `079dd48`)

---

## Sprint Retrospective — Sprint 44

### Velocity

- **Planned**: 1 XL anchor (B-148 — Spike-First tier; interleave floating tabs with saved bookmarks via group `renderOrder`)
- **Completed**: 1 XL anchor shipped as v1.39.0 + 10 polish/hotfix rounds under the B-148 umbrella + 5 docs-only backlog filings (B-162..B-166) + 2 R4 close-out fix-round mutations (HIGH `bootstrapAndSweepRenderOrder` atomicity + MEDIUM `floating:undefined` filter) + retroactive `v1.38.2` tag backfill + new `docs/design/68-b-148-interleave-render-order.md` chapter (670 lines)
- **Tests**: 1930 → 2016 PASS (+86 net, zero failures)
- **Carried over**: 0 work-in-progress items

### What Went Well

- **R0 spike correctly de-risked the largest architectural unknown.** Multi-partition `writeTransaction` atomicity was confirmed before R3 build started, unblocking the 12 atomic write-site refactor with high confidence. The downstream R3 had zero atomicity-class regressions.
- **C-1a / C-1b paired-bump discipline held cleanly.** Schema v6 → v7 shipped with `KNOWN_VERSION` + `defaultShape` paired-bump + `CHANGELOG` SW-flush note + lazy migration strategy explicitly chosen (no rewrite step). Zero migration-class regressions surfaced during UAT.
- **Product-owner UAT cadence + R3 hotfix loop converged fast.** Each of the 10 polish/hotfix rounds (bidirectional drop, off-by-one direction, multi-select sync, opener-chain anchor, etc.) was caught + fixed without re-spec'ing the AC. Iterative R3 fix-rounds proved more efficient than holding all UAT until a single review pass.

### What to Improve

- **R2 write-site enumeration miss (`bulkReorderItems`).** The original 15-task R3 plan did not list `bulkReorderItems` as a `renderOrder`-mutating site; required post-UAT hotfix `f96662a` (`B-148 hotfix — bulkReorderItems updates Group.renderOrder (saved-bookmark drag was a silent no-op)`). This parallels the S42 B-041 D-1 and S37 B-117 D-3 enumeration-class precedents already in CLAUDE.md "Fix-scope test-assertion enumeration" subsection — but for code write-sites, not test assertions. Strengthen R2's site-enumeration discipline to cover both.
- **R6 close gap on `docs/design/NN-*.md` chapter.** §68 chapter was missed in the initial R6 close — when `299e147` cut manifest+CHANGELOG+RELEASES for v1.39.0, no chapter existed. Recovered at S44 close-out by [scrum-master] retroactively dispatching [solution-architect]. R6 close should produce the chapter BEFORE the version bump commit, not after.
- **R4 cold-start race shipped to v1.39.0.** `bootstrapAndSweepRenderOrder` (`floating-groups.js:1142-1248`) shipped with a read-outside / blind-replace race — derivation ran before the `writeTransaction` then committed via `mutator: () => updatedGroups`. Narrow window (cold-start only, after `readyPromise`, before first user gesture) so v1.39.0 ship was not blocked, but the gap shows R4 reviewers should run on the close-out PR's full diff, not just per-item diffs. Caught + fixed during S44 close-out review.

### Action Items for Next Sprint

- [ ] **[scrum-master]** Enforce R6 chapter authoring BEFORE the version-bump commit. No `manifest.json` version-bump / `CHANGELOG` / `RELEASES` commits permitted until the relevant `docs/design/NN-*.md` chapter exists AND the root `docs/SOLUTION_DESIGN.md` TOC has been extended. Update CLAUDE.md "Round 6: Close" to make this ordering explicit.
- [ ] **[solution-architect]** Extend CLAUDE.md "Fix-scope test-assertion enumeration" subsection (currently scoped to test files) to ALSO cover code write-site enumeration when an R2 chapter introduces a new cross-cutting field/contract maintained at multiple write entry points (B-148's renderOrder across 12 sites is the new precedent; B-148 hotfix `f96662a` is the blocking case).
- [ ] **[code-reviewer]** Add "blind-replace mutator" anti-pattern to the R4 review checklist. Any `mutator: () => precomputed` (or `mutator: (current) => somethingElse`) that ignores the `current` snapshot inside a `writeTransaction` is a HIGH-severity race candidate for the partition being written. S44 B-148 `bootstrapAndSweepRenderOrder` is the precedent.

---

## Next sprint candidates for Sprint 45 (filed 2026-05-21 from product-owner direction)

Product-owner direction at S44 close: prioritize the highest-impact correctness gaps surfaced during interleave UAT before returning to long-tail polish.

1. **B-164** — Sleep/wake saved-bookmark→tab claim desync (P1 / M). Single-session OS-sleep failure; distinct from B-149 (SW idle) and B-163 (browser restart). R0 spike candidate: confirm Chrome event sequence on sleep/wake (`onReplaced` vs `onDiscarded` vs nothing) before R1 lock.
2. **B-163** — Drift URL fallback on cold-start re-association (P2 / M, sibling of B-164). Today `reconcileClaims` Phase 2 uses ONLY `item.url`; a drifted tab does not re-bind after cold-start because B-110 §53 paired-clear has already dropped the drift record. R0 spike: pick (a) defer paired-clear / (b) Phase-2 `driftedToUrl` fallback / (c) persist `lastClaimedUrl` rolling field.
3. **B-166** — Floating + promote in-place (P2 / S). Smallest of the three S45 candidates. Post-B-148 the group `renderOrder` already encodes the floating tab's interleaved position; `MSG_PROMOTE_TAB` ignores it and unconditionally appends. R0 spike: pick (a) UI-side `replaceFloatingId` hint / (b) SW-side detection / (c) general-purpose `createItem({insertAt})` parameter. (a) is the cheapest.

---

## Carryover sprint candidates (prior backlog, lower priority than S45 anchors above)

These remain in the backlog and are NOT being actively scheduled for S45 unless explicitly added by the product owner at sprint kickoff:

- **B-150 Q2** lost-sync continuation — B-149 hypothesis mechanisms (a) `chrome.storage.session.tj:tabClaims` write-failure, (b) Edge-aggressive-session-clear, (d) other `releaseClaimByTab` path remain open. Awaits real-world repro signal.
- **B-155** Multi-drag count-badge ghost (Edge regression) — both B-025 UAT-8 strategy and S43 hotfix attempts regressed in current Edge. Investigation candidates: canvas image, `Image()` object, alternate stacking context.
- **B-162** Ctrl+Shift+T reopen (P3 / M) — file partition or grace-window prune; deferable per the "Ctrl+Shift+T was never integrated with TJ pre-B-148" rationale.
- **B-165** drop scroll preservation (P2 / M) — `renderAll` rebuild after drop loses scrollTop; can ride alongside any sidepanel polish wave.
- **B-076** — `MIGRATION_STEPS` hook (P2 / S, pre-S33).
- **B-086** — Sidepanel UI/UX umbrella (P3 / M, pre-S33).
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1).
- **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item.
- **Edge pre-merge smoke test protocol** — S43 retro action item.

---

## How to start Sprint 45

When ready to plan Sprint 45, [scrum-master] runs the Session Start Protocol:
1. Read `docs/BACKLOG.md` to confirm Sprint 45 candidates (defaults to B-164 + B-163 + B-166 from above).
2. Confirm scope with the product-owner (anchor item + any piggyback candidates).
3. Author Sprint 45 active-item content in this file (replace this S44 summary).
4. Verify Gate 6 (Sprint Readiness) — including the deps-resolved check for each in-scope item.
5. Branch off `release/v2` as `feature/sprint-45-<topic>` (only AFTER S44 / v1.39.0 has been merged + tagged on release/v2).
