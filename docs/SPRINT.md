# Current Sprint

*Sprint 15 — URL policy implementation + menu polish. Kicked off 2026-04-17. Closed 2026-04-18.*

---

## Active Items

*(none — all Sprint 15 items are done, ready for close)*

---

## Completed This Sprint

### [B-058] Relax URL-scheme allowlist — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `shared/url.js`, `background/messages/storage-handlers.js`, `tests/b058-scheme-allowlist.test.js` (new), `tests/promote-tab.test.js`, `tests/legacy-migration.test.js`
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ✅ ([code-reviewer] 0C/0H/2M/3L, [security-reviewer] 0C/0H/1M/3L — zero HIGH findings; MEDIUMs M-1/M-2 fixed inline) → DONE
- **Notes**: Opaque-scheme regex now has a `// SECURITY: keep in sync with ALLOWED_URL_SCHEMES` pin at `shared/url.js:71`. Promote-handler comment re-asserts `javascript:`/`data:` remain blocked via `normalizeUrl`.

### [B-027] Group header context menu — ✅ done (Fast Track S)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html`, `tests/b027-group-header-menu.test.js` (new)
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ([code-reviewer] 0C/**2H**/3M/3L, [security-reviewer] 0C/0H/1M/4L) → fixes applied (H-1 Ungrouped dead zone, H-2 double DOM render in select-*, M-1 sec `triggerEl: header` on Close-all-tabs) → DONE
- **Notes**: Reuses B-026 + B-028 context-menu infra. All 7 menu actions present.

### [B-059] Allow duplicate URLs with soft-warn UI — ✅ done (Full M)
- **Completed**: 2026-04-18
- **Files Changed**: `background/messages/storage-handlers.js`, `shared/errors.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `tests/promote-tab.test.js`, `tests/b059-duplicate-warn.test.js` (new)
- **Pipeline**: R1 ✅ → R2 ✅ (`SOLUTION_DESIGN.md §29` — 510 lines) → R3 ✅ → R4 ([code-reviewer] 0C/0H/2M/3L, [security-reviewer] 0C/0H/0M/3L, [qa-reviewer] 0C/0H/4M/10L) → fixes applied (M-1 test fixture `id`→`tabId`, M-2 T-8 fragment coverage added, QA M-4 real-dispatcher T-7 in promote-tab.test.js) → R5 ✅ ([test-engineer] UAT plan at `docs/UAT_B-059.md`) → R6 ✅ ([solution-architect] §29.14 Deviations populated) → R7 ✅ ([technical-writer] CHANGELOG + STORE_LISTING + user-manual) → DONE
- **Notes**: `ERR_DUPLICATE_URL` retained as informational-only per §29.5. Confirm dialog extended with `variant` + `confirmLabel` options. Bulk pre-filter + aggregate confirm for mixed-duplicate selections.
- **Deferred**: R4 QA UAT-9 (dark-theme primary-button contrast ≈ 2.3:1, below WCAG AA) — pre-existing on `.dialog-btn--primary`; logged as **B-062** for Sprint 16.

### [B-061] Dim javascript:/data: rows in Open Tabs — ✅ done (Fast Track XS)
- **Completed**: 2026-04-18
- **Files Changed**: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `shared/url.js`, `tests/b061-unsavable-dim.test.js` (new)
- **Pipeline**: R1 ✅ → R3 ✅ → R4 ([code-reviewer] 0C/0H/2M/4L, [security-reviewer] 0C/0H/0M/3L) → fixes applied (M-1 `isUnsavableScheme` hoisted to `shared/url.js`, M-2 test stub aligned with real `removeAttribute` DOM contract, L-1 CSS blank line, L-4 empty-body positive cases) → DONE
- **Notes**: Purely visual; SW allowlist remains the authoritative gate. Single source of truth via `shared/url.js :: isUnsavableScheme`.

---

## Gate 4 — Release Checklist

- ✅ All R4 review findings resolved (no open CRITICAL/HIGH)
- ✅ All R5 automated tests passing — **605 / 0 fail** (baseline 575 → +30 tests)
- ✅ UAT sign-off recorded by [test-engineer] — `docs/UAT_B-059.md` for the Full tier item; Fast Track items covered by zero-regressions against the full suite
- ✅ No open blockers in SPRINT.md (UAT-9 contrast deferred to B-062 per Blocker Escalation Protocol Option 2)
- ✅ `docs/SOLUTION_DESIGN.md` §29.14 populated by [solution-architect]
- ✅ `manifest.json` permissions reviewed — zero additions this sprint
- ✅ Rollback plan documented — §29.11 for B-059; B-058/B-027/B-061 are `git revert` safe
- ✅ `CHANGELOG.md` / `STORE_LISTING.md` / `docs/user-manual/*` updated by [technical-writer]
- ✅ `BACKLOG.md` updated — all 4 items set to `done`
- ✅ `BACKLOG_BOARD.md` updated — progress 33 → 37 done; in-progress 4 → 0
- ✅ `SPRINT.md` "Completed This Sprint" reflects all 4 items
- ⏳ `SPRINT_ARCHIVE.md` appended — performed during archive step (final sequence entry)

---

## Gate 7 — Sprint Retrospective

### Velocity
- **Planned**: 4 items — B-058 (S) + B-059 (M) + B-027 (S) + B-061 (XS)
- **Completed**: 4/4 items · total effort S+S+M+XS ≈ 7 story points
- **Carried over**: 0

### What Went Well
- **Tight B-057 → B-058/B-059/B-061 spike-to-delivery loop**: the URL-policy spike from Sprint 14 produced three follow-on items that all landed cleanly in one sprint.
- **Fast Track + Full Tier interleaving worked**: B-058/B-027 Fast Track reviews ran in parallel with B-059 R2→R3, and B-061 Fast Track slotted into B-059 R4 idle time without file collisions.
- **R4 → R3 fixes stayed surgical**: all HIGH findings (B-027 H-1/H-2) were localized one-liner fixes; no rework or scope creep.

### What to Improve
- **R2 selector accuracy** — §29.4.4 named `.confirm-btn` when the actual class is `.dialog-btn--danger`. [solution-architect] should grep the live DOM class before naming CSS selectors in R2 designs.
- **Handler-contract tests via real dispatcher** — R4 QA M-4 caught that T-7 was a local wrapper, not bound to `chrome.runtime.onMessage._listeners`. Any new handler test must dispatch through the real listener to catch regressions.
- **Pre-existing token debt surfaces late** — `--accent` dark-theme contrast was invisible until B-059 became the first non-destructive confirm-dialog caller. Promoting a token to a new surface should trigger a proactive theme-token audit.

### Action Items for Next Sprint
- [ ] **B-062** — dark-theme primary-button contrast audit (P1, S). Whole-app sweep of `.dialog-btn--primary` + `[data-variant="primary"]` call sites. Owned by [frontend-engineer].
- [ ] **Process fix** — [solution-architect] R2 selector-verification step: grep every CSS selector mentioned in the design against the actual markup before handoff to R3.
- [ ] **Process fix** — [test-engineer] R5 rule: handler-contract tests MUST dispatch via `chrome.runtime.onMessage._listeners`, not local shims. Document this in the testing standards section.

---

## R4 Findings Log

See `docs/SPRINT_FINDINGS.md` → `# Sprint 15 — R4 Findings`. Final rollup:

| Item | Tier | Reviewers | C | H | M | L | Status |
|------|------|-----------|---|---|---|---|--------|
| B-058 | S | code + sec | 0 | 0 | 3 | 6 | ✅ MEDIUMs fixed, LOWs deferred |
| B-027 | S | code + sec | 0 | 2 | 4 | 7 | ✅ HIGH + MEDIUM fixed, LOWs deferred |
| B-059 | M | code + sec + qa | 0 | 0 | 6 | 16 | ✅ MEDIUMs fixed, qa UAT-9 deferred to B-062 |
| B-061 | XS | code + sec | 0 | 0 | 2 | 7 | ✅ MEDIUMs fixed, LOWs partially fixed |
| **TOTAL** | | | **0** | **2** | **15** | **36** | All HIGH resolved. 15/15 MEDIUM fixed or consciously deferred. |

Zero CRITICAL findings across all items. All HIGH findings resolved before R5.

---

## Sprint Close Sequence Status

1. ✅ Gate 4 — release checklist verified
2. ✅ Gate 7 — retrospective written
3. ⏳ **RELEASE** — [release-manager] to execute v1.10.0 pipeline next
4. ⏳ **ARCHIVE** — appended to `SPRINT_ARCHIVE.md` after release is tagged
