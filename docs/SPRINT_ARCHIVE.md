# Sprint Archive

Historical completed sprint items. Appended by [scrum-master] at the close of each sprint
(after retrospective). Read this file for history; read SPRINT.md for the active sprint only.

---

## Sprint 1 — Foundation Spike (2026-04-15)

**Theme:** Ship the storage schema + data model that every other item depends on.
**Release:** v1.0.0

### Completed Items

#### [B-001a] Partitioned storage schema + CRUD + ULIDs — ✅ DONE
- **Tier**: Full (M)
- **Closed**: 2026-04-15
- **Pipeline**: R0 spike ✅ · R1 ✅ · R2 ✅ · R3 ✅ · R4 Review ✅ (C=2, H=7, M=9, L=9) · R4 Fix ✅ · R5 ✅ (34/34 + UAT PASS) · R6 ✅ (SOLUTION_DESIGN.md v1.1) · R7 skipped (no user-visible change)
- **Files changed** (15 new): `background/service-worker.js`, `background/storage/{partitions,ids,errors,write-transaction,items,groups,preferences,index}.js`, `background/messages/storage-handlers.js`, `shared/messages.js`, `.eslintrc.json`, `jsconfig.json`, `package.json`, `sidepanel/sidepanel.html`, `newtab/newtab.html`, `popup/popup.html` (stubs), `tests/*` (15 files, 34 tests)
- **Follow-ups created**: B-053 (circular dep refactor)

### Velocity
- Planned: 1 item / M effort
- Completed: 1 item / M effort
- Carried over: B-001b, B-001c → Sprint 2 (by design)

### Retrospective

**What Went Well:**
- Full pipeline (R0–R6) executed cleanly on the first sprint item
- R0 spike correctly decomposed B-001 XL into 4 sub-items, unblocking parallelism
- R4 review quality was high — 2 CRITICALs and 2 security HIGHs caught before R5

**What to Improve:**
- R2 correctness checklist missed manifest file-exists validation — UI stubs discovered at UAT time
- R4 reviewers should be launched in a single parallel message, not serialized
- R5 UAT instructions incorrectly referenced a `dist/` folder; extension loads from repo root

**Action Items Applied:**
- [x] Added C-5 to R2 Correctness Checklist in CLAUDE.md (manifest file references)
- [x] Added "Build & Load" section to CLAUDE.md (no compile step, no dist/)
- [x] Ensure R4 reviewers launched in single parallel message (done in Sprint 2)

---

## Sprint 2 — Data Layer Completion (2026-04-15)

**Theme:** Complete the non-UI data layer — migration runner + live tab tracking.
**Release:** v1.1.0

### Completed Items

#### [B-001b] Schema version + migration runner + safe-mode — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4 findings: C=1 H=5 M=5 L=4 (all C+H fixed) · R5: 60/60 · UAT skipped · R7 skipped
- **Files**: `background/storage/migration.js` (new) + mods to SW, handlers, errors, index, messages
- **Tests**: 9 files, 26 tests

#### [B-001c] LiveTabIndex + TabClaims disambiguation — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4 findings: C=0 H=3 M=5 L=6 (all H fixed) · R5: 81/81 · UAT skipped · R7 skipped
- **Files**: `background/tabs/` (4 new files) + mods to SW, handlers, messages
- **Tests**: 10 files, 21 tests

### Velocity
- Planned: 2 items / 2M parallel
- Completed: 2 items / 2M
- Carried over: 0

### Retrospective
**Went Well:** parallel pipeline worked without merge conflicts; all 6 R4 reviewers batched in single message; zero B-001a regressions.
**To Improve:** UAT skipped; R4 finding volume high (R2 could be more defensive); migration multi-partition scaffold is a known limitation.
**Action Items:** don't skip UAT for UI work; refactor writeTransaction ops when first real migration lands.

---

## Sprint 3 — Foundation Complete + URL Normalization (2026-04-15)

**Theme:** Finish B-001 family + start Phase A with URL normalization.
**Release:** v1.2.0

### Completed Items

#### [B-001d] Drift + floating-tab re-association — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4: C=0 H=6 M=7 L=6 (all H fixed) · R5: 119/119 · UAT skipped
- **Files**: `background/tabs/drift.js`, `background/tabs/floating-groups.js` (new) + 7 mods
- **Tests**: 11 files, 30 tests

#### [B-002] URL normalization — ✅ DONE (Fast Track)
- **Tier**: Fast Track (S) · **Closed**: 2026-04-15
- **Pipeline**: R1 → R3 → R4 ✅ · C=1 H=1 fixed · 84→119 tests
- **Files**: `shared/url.js`, `shared/errors.js` (new) + 5 mods
- **Milestone**: Entire B-001 family (a/b/c/d) complete — full data layer shipped

### Velocity
- Planned: 1L + 1S · Completed: 2 items · Carried over: 0

### Retrospective
**Went Well:** B-001 family fully shipped across 3 sprints; Fast Track worked for B-002; R4 caught critical import violation.
**To Improve:** R4 reviewers still not always batched in single message; shared→background import direction needs lint rule.
**Action Items:** add ESLint rule preventing shared/ from importing background/.

---

## Sprint 4 — Phase A Features (2026-04-15)

**Theme:** Group palette enforcement + promote/demote operations.
**Release:** v1.3.0

### Completed Items
- **B-006** (Full M) — Group palette enforcement (9 colors) + duplicate-name warning. 35 tests.
- **B-016** (Fast Track S) — MSG_PROMOTE_TAB handler. Duplicate-URL detection, scheme filtering, immediate claim. 11 tests.
- **B-017** (Fast Track S) — MSG_DEMOTE_ITEM handler. Preserves live tab, saves floating-group position, clears drift. 14 tests.

### Velocity
- Planned: 1M + 2S · Completed: 3 items · Carried over: 0

### Retrospective
**Went Well:** First Phase A sprint; Fast Track efficient for promote/demote; R4 caught 2 promote blockers.
**To Improve:** Backlog dep graph has aspirational deps (B-016→B-003) that aren't real blockers — clean up.
