# Sprint 48 — R4 Findings (Deduplicated)

Sprint 48 = B-194 unified-item-model render bundle (Sprint A). Fast Track items get [code-reviewer] + [security-reviewer] (qa skipped); Full items get all three.

## B-186 — Renumber `LiveTabIndex.index` survivors on single-tab close (Fast Track)

Reviewed at commit `e0f2887`. [code-reviewer] + [security-reviewer].

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW (both fixed in the post-review pass, commit follows)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| L-1 | `background/tabs/live-tab-index.js:88` | JSDoc implied the renumber loop is O(same-window entries); it is actually one O(N-total) pass filtered by `windowId`. Cosmetic. | Added an explicit complexity note (O(N-total), same cost class as `onMoved`/`onActivated`). |
| L-2 | `tests/b186-livetab-index-renumber.test.js` | No test exercised the bare `chrome.tabs.onRemoved.__fire(tabId)` path (no `removeInfo`); the `!(removeInfo && …)` guard handles it but was uncovered. | Added a guard test firing `onRemoved.__fire(11)` with no second arg; asserts renumber runs (single-close). |

### Informational (non-blocking, no change required)
- [security-reviewer] noted `entry.index -= 1` direct mutation vs the sibling `onMoved` handler's `updateTabEntry(id,{index})` — functionally equivalent (both `Object.assign` an existing entry); left as-is (idiomatic inside the tight loop).

### Gate results
- **Contract-vs-implementation diff (code-reviewer): clean** — strict `>` predicate, same-window guard, decrement-by-one all verbatim per the R1 AC (`docs/sprint-48-r1.md:30-42`).
- **Security: CLEAN** — no new permissions, no `chrome.storage` writes, no constructable race (renumber + delete run in one synchronous task before any `await`; `buildOpenTabs` can't observe the transient duplicate index). Cold-start-rebuild and window-close paths verified safe.
- Suite 2158 → 2168 PASS (+10: 9 build + 1 L-2 coverage), zero regressions.

## B-196 — Render merge: single top-level catch-all region (Full — L)

Reviewed at commit `bf55cfe`. [code-reviewer] + [security-reviewer] + [qa-reviewer]. Deduped across code + qa.

### CRITICAL
_None_

### HIGH (must fix before R5 — routed to the B-196 R4 fix-round)
| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:3342-3345` | `patchFloatingMembersSections` never derives `renderOrder` for the `__toplevel__` sentinel (`_cachedGroups` has no record) → new top-level floating rows bottom-drop on the incremental path. Contract-diff NARROWING vs §79.5.2 R-4. Latent until B-197. Found by BOTH code + qa. | Sentinel branch: derive via `_deriveTopLevelRenderOrder(_cachedItems.filter(it=>it.groupId==null), members)` and use as the anchor authority, same as full render. |
| H-2 | `sidepanel/sidepanel.js` (`buildTopLevelSection` ~3570, `toggleGroup` ~4482) | Collapsing the merged region hides the head container but leaves the loose-tab tail visible + keyboard-accessible with `aria-expanded=false` — ARIA violation, **visible today**. Found by qa. | `tailList.hidden = collapsed` on build; toggle the tail in `toggleGroup`'s `TOP_LEVEL_ID` branch. + regression test. |

### MEDIUM (folded into the same fix-round — B-197 prerequisites / consistency)
| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `newtab/newtab.js:826,996` | Newtab passes `group=null` to `resolveRenderOrder` (bootstrap fallback), not the derived `__toplevel__` owner → won't interleave top-level floating below parents when B-197 lands (cross-surface divergence vs §79.3.3). code M-2 + qa M-1. | Build the same synthetic `{id, renderOrder: derived}`; extract `_deriveTopLevelRenderOrder` to a shared home (DRY). |
| M-2 | `sidepanel/sidepanel.js:3453-3458` | `patchFloatingMembersSections` count badge omits the tail count for `__toplevel__` (undercounts after B-197). qa M-2. | Include tail count for the sentinel. |
| M-3 | `sidepanel/sidepanel.js:8737` | No migration from `tj-ungrouped-collapsed` → `tj-toplevel-collapsed` sessionStorage key → collapse state lost within a session after update. Visible today. qa M-3. | Migrate the key once in init + clear the stale key. + test. |
| M-4 | `shared/group-picker-core.js:55,67,73-74`, `popup/group-jump-popup.js:583` | Move-destination sentinel still `'__ungrouped__'` while render uses `'__toplevel__'` — cross-surface string divergence; future bug if a caller passes `'__toplevel__'`. code M-1/M-3 + qa L-1 + security informational. §79.2.3 said align. | Align to `'__toplevel__'` (verify null-keyed destination semantics preserved); update dependent tests b029/b023. |

### LOW
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| L-1/L-2 | `tests/b029-group-picker.test.js:533,633`, `tests/b023-group-jump-popup.test.js:644` | Test sentinels dependent on M-4 alignment. | Updated with M-4. |

### Informational (non-blocking)
- [code-reviewer]/[qa]: the `b036-newtab.test.js:534` "may be async" diagnostic is **noise** (manual `Promise.resolve()`; semantically identical). No change.
- [qa]: `aria-label="Top Level"` on the `role=listitem` section is redundant with the header text (minor AT verbosity); sidepanel count badge lacks an `aria-label` that newtab has (pre-existing).
- [security]: optional belt-and-suspenders reserved-id guard rejecting `id==='__toplevel__'` in `createGroup` (ULID invariant already makes collision impossible).

### Gate results
- **Security: CLEAN** — no `innerHTML` sinks (all `textContent`; inline SVG icons are static/pre-existing), `__toplevel__` sentinel collision-safe (group ids are ULIDs; detection by id-equality not name; corrupt storage degrades benignly), no new permissions/CSP/storage-writes/message types.
- **Contract-vs-implementation diff**: sidepanel full-render path CLEAN (owner derivation, empty-state, below-groups, no-divider, newtab head-only all verbatim); the incremental patch path NARROWED (H-1); newtab owner deviation (M-1).
- Empty-states E1-E4 walked: E1/E2/E4 PASS, E3 conditional-pass (H-2 collapse caveat).

### Fix-round resolution (2026-07-10)
All HIGH + MEDIUM + LOW resolved in one [frontend-engineer] fix-round: H-1 (sentinel `__toplevel__` renderOrder in the incremental patch), H-2 (collapse-tail a11y + regression test), M-1 (`deriveTopLevelRenderOrder` extracted to `shared/render-order.js`, used by both sidepanel + newtab), M-2 (count-badge tail), M-3 (collapse-state migration + test), M-4 (sentinel align in group-picker + popup, null-keyed destination semantics verified). Optional reserved-id guard skipped (ULID invariant → unreachable; would be dead code). `sidepanel/search-index.js` `__ungrouped__` bucket-key deliberately kept per §79.2.3 (R3's call, no behavior change). +18 tests (`tests/b196-toplevel-region.test.js`) + 3 pre-existing contract updates (b148/b187/b104). Suite 2179 → 2197 PASS. [scrum-master] independently verified the H-1 derivation and H-2 collapse polarity.
