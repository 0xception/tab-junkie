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
