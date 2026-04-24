# Current Sprint

*Sprint 28 — B-035 Standalone Window + B-046 Global Shortcuts + B-082 Popup "Open Side Panel" Button. Closed 2026-04-23 with v1.22.0.*

Three-item sprint. B-035 (Full M) anchored; B-046 reduced to Fast Track XS at R1 (shortcuts already registered); B-082 Fast Track XS shipped cleanly. Bonus: UAT-4 surfaced a 9-sprint-old `hashItem` blindspot from B-052 — fixed as cross-module amendment (§34.15 + §41.10).

---

## Completed This Sprint

### [B-035] Standalone Window Display Mode — DONE
- **Tier**: Full (M) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ (20 ACs) · R2 ✅ (§41 design chapter) · R3 ✅ (~66 LOC SW) · R4 ✅ (1 HIGH + 1 MEDIUM + 2 LOW fixed) · R5 ✅ (+24 tests) · UAT 12/13 PASS + 1 SKIP (single-display, expected) + 2 UAT-4 fix cycles · R6 ✅ (§41.10 As Built with 5 deviations + fix chain) · R7 ✅
- **Files**: `background/service-worker.js` (+66 LOC listener+helper+constants), `tests/b035-standalone-window.test.js` (new, 24 tests)
- **R2 decisions**: D-1 `popup` window type, D-2 load `sidepanel/sidepanel.html` directly (zero new HTML), D-3 `getAll`+URL-match existing-instance detection (cold-start safe), D-4 1200×800 centered on focused window, D-5 `MSG_STATE_CHANGED` subscription automatic, D-6 C-11 vacuous, D-7 NO new permission (`chrome.windows.*` implicit under `tabs` — B-014 precedent), D-8 B-063 `window.blur` listener inherits automatically
- **R4 fixes pre-R5**: H-1 anchor fallback (restored `|| allWins[0]`), M-2 popup-type filter for anchor set, L-1 key order, L-2 comment citation
- **UAT-4 fix chain** (cross-module, documented §41.10.1 + §34.15):
  - Layer 1: `sidepanel/search-index.js` `hashItem` now includes `sortOrder` — closes S24 §37.9 F-1 long-deferred optimization
  - Layer 2: `sidepanel/sidepanel.js` broadcast handler — pre-patch sortOrder check → bail to `renderAll` when reorder detected (patch layer can't reparent DOM nodes)
  - Test suite: `tests/b052-fuzzy-search-perf.test.js` sortOrder-edit-noop test inverted to expect `patch` (S28 docstring documents the invariant change)

### [B-046] Global Keyboard Shortcuts — DONE
- **Tier**: Fast Track XS (reduced from S at R1 — shortcuts already registered v1.18.0+)
- **Pipeline**: R1 ✅ · R3 ✅ (doc-only: `docs/user-manual/keyboard-shortcuts.md`) · R4 ✅ (0 HIGH; 2 MEDIUM doc polish applied inline)
- **Files**: `docs/user-manual/keyboard-shortcuts.md` (new, 45 lines + forward-compat note + three-vs-four wording polish)

### [B-082] Popup "Open Side Panel" Button — DONE
- **Tier**: Fast Track XS
- **Pipeline**: R1 ✅ · R3 ✅ (popup button + handler + CSS + chrome-mock extension) · R4 ✅ (1 HIGH Tab trap + 2 MEDIUM + 1 LOW fixed)
- **Files**: `popup/popup.{html,js,css}` (+94 net), `tests/chrome-mock.js` (+28 sidePanel mock), `tests/b082-popup-sidepanel-btn.test.js` (new, 3 tests)
- **R4 fixes pre-close**: H-1 Tab trap includes new button (input ↔ rows ↔ button cycle), M-1 defensive `window.close()` comment, M-2 rapid-click guard, L-1 error-color theme tokens

---

## Gate 4 — Release Checklist (verified 2026-04-23)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 CRITICAL · 2 HIGH (B-082-H1 Tab trap + B-035-H1 anchor fallback) fixed · 4 MEDIUM fixed · ~10 LOW deferred |
| 2 | All R5 automated tests passing | ✅ — **1190/1190** green (1163 baseline + 24 B-035 + 3 B-082; 1 B-052 test inverted per hashItem amendment) |
| 3 | UAT sign-off | ✅ — B-035 12/13 PASS · 1 SKIP (UAT-6 secondary monitor, single-display) · 2 UAT-4 fix cycles cleared · B-082 smoke PASS · B-046 smoke PASS |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` updated | ✅ — §41 chapter + §41.10 As Built (5 deviations incl. fix chain) · §34.15 S28 amendment (hashItem + sortOrder closes §37.9 F-1) · root index §41 TOC entry |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions; only version bump 1.21.0 → 1.22.0 |
| 7 | `./build.sh` produces clean package | ✅ — 264 K zip, 74 files |
| 8 | Rollback plan documented | ✅ — §41.8 data-clean (zero schema changes, zero new permissions); cross-module hashItem fix revertible via git |
| 9 | README / user manual / STORE_LISTING | ✅ — CHANGELOG [1.22.0] · new `docs/user-manual/standalone-window.md` · `quick-search-popup.md` +8 lines (Open side panel section) · `keyboard-shortcuts.md` (S28 B-046) · STORE_LISTING +2 lines |
| 10 | `BACKLOG.md` — all S28 items `done` | ✅ (80/87) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ — 92% (80/87) · 0 in-progress · S29 next |
| 12 | `SPRINT.md` "Completed This Sprint" | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 28

### Velocity

- Planned: 3 items (1 Full M + 2 Fast Track XS)
- Delivered: 3 items — 100% scope. B-046 reduced S→XS at R1 (audit-first approach validated).
- Test growth: **1163 → 1190 (+27 net)** — 24 B-035 + 3 B-082; 1 B-052 test inverted (net 27 new tests)
- UAT rounds: B-035 = 2 fix cycles on UAT-4 (hashItem + patch-consumer); B-082 + B-046 smoke clean
- Release: **v1.22.0**
- **6 consecutive sprints shipped without rollback or post-merge regression** (S23 through S28)

### What Went Well

1. **R1 audit-first reduced B-046 scope correctly**. PM agent's first R1 deliverable was "verify manifest state" — found shortcuts already registered. Tier auto-reduced S→XS. Saved an estimated 60-80% of the Full-tier overhead (no R2 chapter, no Full R4, no pre-merge UAT). This pattern (audit before scoping) is the right default for follow-up items to shipped infrastructure.
2. **S27 retro rubric paid out again**. R4 reviewers elevated async-listener-like HIGHs (B-082-H1 Tab trap, B-035-H1 anchor fallback) per the "deviates from spec + user-visible = HIGH by default" rule. Both were silent-regression risks.
3. **Meta-loop continues**. S26 → S27 shipped C-11 codification → S28 applied C-11 from day one on B-035. R4 + UAT surfaced zero popup-lifecycle issues (contrast S26's 3 UAT blockers). Discipline compounds.
4. **B-035 reused sidepanel.html verbatim (D-2)**. Zero new HTML, zero new CSS, zero new message types — standalone window IS the sidepanel loaded in a different host. All feature parity (drag-drop, context menus, state sync) was automatic. Architectural leverage.

### What to Improve

1. **HIGH — UAT-4 surfaced a 9-sprint-old latent bug (`hashItem` sortOrder blindspot)**. B-052 (S19) shipped the hash without `sortOrder`; B-030 v2 (S23) worked around it with originating-surface `renderAll` tail; B-025 (S24) deferred the sortOrder fix as §37.9 F-1 "future optimization"; B-035 (S28) is the FIRST new surface that consumes broadcasts WITHOUT an originating-surface workaround — UAT-4 was the first opportunity for the bug to be observable. **Pattern lesson**: when a new surface consumes an existing broadcast, audit the broadcast-receiver paths in OTHER surfaces for patterns that only work because of the originating surface's compensations. Propose adding this as an R2 check (candidate future C-12) once we have a second precedent. For S29: document this pattern in the CLAUDE.md §Round 2 Correctness Checklist as a note, not yet a formal C-entry.
2. **MEDIUM — Patch-consumer layer had latent reorder gap**. `_patchSingleRow` handled rename, URL change, cross-group move (returned false) — but not same-group reorder. This was invisible until `hashItem` fix surfaced reorder as `patch` delta. The S28 fix (pre-patch sortOrder check → renderAll bail) is robust but reactive. A proper fix would extend `_patchSingleRow` to handle same-group reorder via `insertBefore` reordering. S29+ candidate for hygiene cleanup.
3. **LOW — UAT-4 fix chain required 2 cycles (hashItem, then patch-consumer)**. User reported reorder-sync broken after the first fix. An R2 design that enumerated the full broadcast → diffAndPatch → patch-consumer → DOM path would have identified both layers up-front. S29+: for any broadcast-related change, the R2 must trace the full receiver path.

### Action Items for Sprint 29

- [ ] **[scrum-master]** S29 scope — per roadmap: B-038/039/040 (XS prefs) + B-036 (P3/L new tab page, applies C-11 from day one). B-036 is the next L anchor; B-038/039/040 are 3 trivial XS items. P-1 allows B-036 alone or paired with 1-2 XS items. [HIGH]
- [ ] **[solution-architect]** Propose new retro pattern: when a new surface consumes existing broadcasts, audit broadcast-receiver compensations in other surfaces. Add as a CLAUDE.md note (not yet a formal C-entry — wait for second precedent). [MEDIUM]
- [ ] **Patch-consumer same-group reorder handling**: extend `_patchSingleRow` to detect sortOrder drift and `insertBefore` reposition instead of bailing to renderAll. Perf improvement; not a correctness issue. Candidate for S29+ hygiene or B-088 bundle. [LOW]
- [ ] **S25/S26/S27/S28 hygiene carry-forward**: accumulating ~20 deferred items across 4 sprints. Decide at S29 kickoff whether to file B-088 hygiene-pass (P2/S) or continue opportunistic absorption. [LOW]

### R4 Findings Summary (Sprint 28)

- **B-082**: 0 CRITICAL / 1 HIGH (fixed) / 2 MEDIUM (fixed) / 1 LOW (fixed)
- **B-046**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (fixed inline) / 2 LOW (deferred)
- **B-035**: 0 CRITICAL / 1 HIGH (fixed) / 1 MEDIUM (fixed) / 3 LOW (2 fixed, 1 deferred); 0 security findings
- **UAT layer**: 1 blocker (UAT-4 reorder sync) — required 2-layer fix (hashItem + patch-consumer). Observable only with a second sidepanel-consuming surface (B-035). Latent 9 sprints.
- **Security posture**: zero new permissions · zero new network calls · zero new message types · zero new partitions. XSS tight; SW listener sync + idempotent. All C-1 through C-11 PASS or N/A.
- **Full dedup**: `docs/findings/sprint-28.md`

**Key lesson**: The `hashItem` sortOrder blindspot was a classic "works because of compensating workaround" bug. Not caught by unit tests (tests were written to the workaround contract). Not caught by any of 4 consumer sprints because they all had the originating-surface compensation. Caught by UAT-4 the moment B-035 introduced a surface without the compensation. Pattern: test-first culture is insufficient when tests codify the workaround instead of the invariant. R2 design review is the appropriate gate for this class of latent tech debt — but the reviewer must trace the full receiver path, not just the originator.

---

## Sprint Close

**Status**: CLOSED 2026-04-23. v1.22.0 release pending commit + tag + archive.

### Follow-on for Sprint 29

Per roadmap + retro:
- **B-036** (P3/L) — new tab page replacement (optional, `chrome_url_overrides` manifest). Full tier anchor. Applies C-11 from day one (new-tab context is popup-adjacent).
- **B-038** (P3/XS) — display mode preference (side panel vs standalone)
- **B-039** (P3/XS) — new tab page toggle preference
- **B-040** (P3/XS) — sub-group auto-collapse preference
- Optional **B-088** (new, P2/S) — bundled hygiene pass (~20 items from S25-S28)
- P-1 single L + multiple XS feasible
