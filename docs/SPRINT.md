# Current Sprint

*Sprint 1 — Foundation Spike. Kicked off 2026-04-15 after R0 spike on B-001 (split into 4 sub-items).*

---

## Architectural Decisions Locked in R0 Spike (2026-04-15)

These apply to all four B-001 sub-items and must be honored by downstream agents:

1. **Storage layout**: 6 partitioned keys under `chrome.storage.local` → `tj:meta`, `tj:items`, `tj:groups`, `tj:prefs`, `tj:drift`, `tj:floatingGroups`
2. **State representation**: `drifted` persists; `live / active / audible` are ephemeral (SW-memory `LiveTabIndex`, rebuilt at cold start from `chrome.tabs.query`)
3. **Disambiguation**: `TabClaims` pairing table in `storage.session`; re-claimed on cold start in item-sort-order
4. **Group hierarchy**: `parentId` adjacency; depth = 1 enforced at write boundary
5. **ID format**: **ULID** (sortable, stable, never reused, never derived from URL/title)
6. **Service worker is sole writer**: UI surfaces (sidepanel / newtab / popup) send messages; SW serializes all writes
7. **`writeTransaction()` helper**: batches logical multi-step ops into a single `storage.local.set` to survive mid-write SW termination
8. **Storage quota**: **Cap at 10MB** (chrome.storage.local default). No `unlimitedStorage` permission. Prompt user at 80%.
9. **Downgrade policy**: **Read-only safe-mode** when `schemaVersion > known`. All writes blocked, visible banner, reads still work. No reverse migrations required.
10. **Floating-tab re-association (B-001d)**: Match **exact window ID + tab index** first; fall back to URL only if the original window no longer exists.
11. **Manifest permissions for B-001**: NONE new. `storage` and `tabs` already declared.

---

## Active Items

*(none — B-001a complete; B-001b/c ready to launch in Sprint 2)*

---

## Queued for Sprint 1 (not yet active)

| ID | Title | Tier | Dep | Notes |
|---|---|---|---|---|
| B-001b | Schema version + migration runner + safe-mode | Full (M) | B-001a | Starts when B-001a passes Gate 4 |
| B-001c | LiveTabIndex + TabClaims disambiguation | Full (M) | B-001a | Runs in parallel with B-001b (no shared files) |

## Pushed to Sprint 2

| ID | Title | Tier | Dep | Reason |
|---|---|---|---|---|
| B-001d | Drift + floating-tab exact-position re-association | Full (L) | B-001a/b/c | L effort + dependency chain doesn't fit Sprint 1 scope |

---

## Completed This Sprint

### [B-001a] Partitioned storage schema + CRUD + ULIDs — ✅ DONE
- **Tier**: Full (M)
- **Closed**: 2026-04-15
- **Pipeline**: R1 ✅ · R2 ✅ · R3 ✅ · R4 Review ✅ (C=2, H=7, M=9, L=9) · R4 Fix ✅ (all C+H + 6 M resolved) · R5 ✅ (34/34 automated + UAT PASS) · R6 ✅ (SOLUTION_DESIGN.md v1.1) · R7 skipped (no user-visible change)
- **Files changed** (15 new):
  - `background/service-worker.js`
  - `background/storage/{partitions,ids,errors,write-transaction,items,groups,preferences,index}.js`
  - `background/messages/storage-handlers.js`
  - `shared/messages.js`
  - `.eslintrc.json` · `jsconfig.json` · `package.json`
  - `sidepanel/sidepanel.html` · `newtab/newtab.html` · `popup/popup.html` (placeholder stubs — surfaced at UAT)
  - `tests/*` (15 files, 34 tests, ~620 LoC)
- **SOLUTION_DESIGN.md updated**: yes, v1.1
- **Retrospective note**: R2 correctness checklist missed a manifest-file-resolution check. UI stubs were discovered only at UAT time. Fix in next sprint's process: add "manifest.json references resolve at load time" to the R2 checklist.
- **Follow-ups created**: B-053 (break circular dep, re-enable checkJs) — P2/S in backlog

---

## Execution Plan

1. R1 [product-manager] sharpens B-001a user story / AC / edge cases (active now)
2. R2 [solution-architect] produces the detailed design for B-001a only (schema shape, write API, message contracts). The R0 spike already anchored the approach.
3. R3 [frontend-engineer] builds.
4. R4 [code-reviewer] + [security-reviewer] + [qa-reviewer] in parallel.
5. R5 [test-engineer] writes tests + runs UAT.
6. R6 [solution-architect] updates `docs/SOLUTION_DESIGN.md`.
7. R7 [technical-writer] — skipped unless this becomes user-visible (it won't — data layer only).
8. [scrum-master] reassesses sprint capacity and decides whether to launch B-001b and B-001c next.

---

## Gate 6 — Sprint 1 Readiness Check

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | All items have user story + AC | ✅ | B-001a has 6 ACs |
| 2 | Priority + effort + dependencies assigned | ✅ | P0 · M · no deps |
| 3 | External dependencies confirmed | ✅ | none required |
| 4 | Total effort scoped to sprint duration | ✅ | 1M active; 2M queued; 1L pushed to Sprint 2 |
| 5 | SPRINT.md populated with all items | ✅ | B-001a active, B-001b/c queued, B-001d deferred |
| 6 | No unresolved blockers from previous sprint | ✅ | first sprint — n/a |

**Gate 6 Result: ✅ READY — Sprint 1 executing**

---

## Gate 4 — Release Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | All R4 review findings resolved (no CRITICAL/HIGH) | ✅ | C=2 fixed, H=7 fixed. M1/M6/M9 deferred (non-blocking). |
| 2 | All R5 automated tests passing | ✅ | 34/34 passing via `npm test` |
| 3 | UAT sign-off recorded | ✅ | UAT PASS 2026-04-15 (popup devtools, 4 round-trip checks) |
| 4 | No open blockers in SPRINT.md | ✅ | none |
| 5 | SOLUTION_DESIGN.md updated | ✅ | v1.1 by [solution-architect] R6 close |
| 6 | manifest.json permissions reviewed | ✅ | No new permissions. `tabGroups`, `sidePanel`, `search` pre-declared for future items (audit LOW) |
| 7 | ./build.sh produces clean package | ✅ | tab-junkie.zip 44K, 30 files |
| 8 | Rollback plan documented | ✅ | SOLUTION_DESIGN.md §12 |
| 9 | README/STORE_LISTING updated | N/A | B-001a has no user-facing changes; R7 skipped |
| 10 | BACKLOG.md completed items set to done | ✅ | B-001a = done |
| 11 | BACKLOG_BOARD.md accurate | ✅ | 1/56 done, P1% fixed (54%) |
| 12 | SPRINT.md "Completed This Sprint" accurate | ✅ | B-001a with full pipeline trail |
| 13 | SPRINT_ARCHIVE.md updated | ⬜ | Pending — happens after release |

**Gate 4 Result: ✅ PASS (13/13 — #13 deferred to archive step)**

---

## Gate 7 — Sprint 1 Retrospective

### Velocity
- Planned: 1 item (B-001a) / M effort (3M queued, 1L pushed)
- Completed: 1 item (B-001a) / M effort
- Carried over: 2 items (B-001b, B-001c → Sprint 2; by design, not overrun)

### What Went Well
- Full pipeline (R0 spike through R6 close) executed cleanly on the first item — 7 rounds, 3 parallel reviewers, 10 ACs, 34 tests, UAT PASS
- R0 spike caught the right decomposition — splitting B-001 XL into 4 sub-items unblocks Phase A parallelism
- R4 review quality was high — 2 CRITICALs (dangling FK, bare init write) and 2 security HIGHs (URL scheme, length caps) caught before R5

### What to Improve
- R2 correctness checklist missed a "manifest.json file references resolve at load time" check — UI stubs discovered only at UAT, causing a user-blocking error during manual testing
- R4 reviewers should have been launched in a single parallel message per CLAUDE.md, not serialized — [code-reviewer] returned before [security-reviewer] and [qa-reviewer] were dispatched
- UAT instructions incorrectly referenced a `dist/` folder (build.sh only produces a zip); the extension loads unpacked from repo root — future R5 agents need this context

### Action Items for Next Sprint
- [ ] Add "C-5: All manifest.json `default_path` / `default_popup` / `chrome_url_overrides` resolve to existing files" to the R2 Correctness Checklist in CLAUDE.md
- [ ] Add a "Build & Load" section to CLAUDE.md: "No compile step, no dist/. Extension loads unpacked from repo root. build.sh produces a zip for Chrome Web Store only."
- [ ] Ensure R4 reviewer agents are launched in a single message with 3 parallel Agent tool calls
