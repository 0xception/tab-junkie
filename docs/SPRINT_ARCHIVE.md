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
- [ ] Ensure R4 reviewers launched in single parallel message (process discipline, not a code change)
