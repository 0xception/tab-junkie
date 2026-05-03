# Tab Junkie — Product Board

**Updated:** 2026-05-02 · **Version:** 2.43.closed · **Total Items:** 148 · **Sprint 43 closed. v1.37.0 shipped on release/v2 (PR #48 merged 2026-05-02 as `785a602`; tag `v1.37.0` pushed). 7 items closed (B-149 hygiene, B-150 Q1, B-151/152/153, B-154, B-156, B-157), 2 filed-and-deferred (B-150 Q2 awaits repro, B-155 Edge ghost follow-on).**

---

## Progress Dashboard

```
Overall Progress    ███████████████████░  95% (143/148)  [S43 closed · v1.37.0 shipped on release/v2]
```

### Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 | P0 — Critical (blocks launch) |
| 🟠 | P1 — High (must do) |
| 🟡 | P2 — Medium (plan for soon) |
| ⚪ | P3 — Nice-to-have |
| ✅ | Done |
| 🔄 | In Progress |
| ⬜ | To Do |

**Effort:** XS · S · M · L · XL

---

## Sprint 1 — Foundation Spike

> 1/57 done · 0 in progress

✅ B-001a — Partitioned storage schema + CRUD + ULIDs · 🔴 · M
✅ B-001b — Schema version + migration runner + safe-mode · 🔴 · M
✅ B-001c — LiveTabIndex + TabClaims disambiguation · 🔴 · M
✅ B-001d — Drift + floating-tab exact-position re-association · 🔴 · L
✅ B-002 — URL normalization & validation · 🟠 · S
✅ B-003 — Save / edit / delete saved bookmarks · 🔴 · L
✅ B-004 — Favicon auto-capture + letter-avatar fallback · 🟠 · S
✅ B-005 — Bulk-create saved items (import primitive) · 🟠 · M
✅ B-006 — Create / edit / delete groups with color palette · 🔴 · M
✅ B-007 — Sub-group nesting (depth = 1) · 🟠 · M [Sprint 20 Wave 2 — merged 0993189 / PR #24]
✅ B-008 — Group reorder & collapse / expand persistence · 🟠 · M
✅ B-009 — Drag-to-expand collapsed group · 🟡 · S [S23 Wave 1 — merged df4a024 / PR #29]
✅ B-010 — Live tab reflection & active-tab highlight · 🔴 · L
✅ B-011 — Drift detection & persistence · 🔴 · L
✅ B-012 — Audible tab indicator · 🟠 · XS
✅ B-013 — Opener-chain group inheritance for new tabs · 🟠 · M
✅ B-014 — Multi-window awareness & window badge · 🟠 · M
✅ B-015 — Tab-tracking cleanup on close · 🟠 · S
✅ B-016 — Promote live tab to saved bookmark · 🔴 · S
✅ B-017 — Demote saved bookmark (preserve live tab) · 🔴 · S
✅ B-018 — Floating tab group persistence across restart · 🔴 · M
✅ B-019 — Click-to-navigate with tab reuse & window focus · 🔴 · S
✅ B-020 — Close tab from UI (individual + bulk) · 🔴 · S
✅ B-021 — Inline side-panel filter with debounce & highlight · 🟠 · M
✅ B-022 — Quick search popup with keyboard navigation · 🟠 · L [S26 — v1.20.0]
✅ B-023 — Group jump popup · 🟠 · L [S27 — v1.21.0]
✅ B-024 — Multi-select + bulk action bar · 🟠 · M
✅ B-025 — Multi-item drag as single unit · 🟠 · M [S24 — v1.18.0]
✅ B-026 — Item context menu · 🟠 · S
✅ B-027 — Group header context menu · 🟠 · S
✅ B-028 — Selection context menu · 🟠 · S
✅ B-029 — Group picker modal · 🟠 · M
✅ B-030 — Item drag-reorder within / between groups · 🟠 · L [S23 Wave 0 — merged 791d50e / PR #28; pre-merge UAT 9/9 PASS]
✅ B-031 — Group drag-reorder & nesting via drag · 🟠 · M [S24 — v1.18.0]
✅ B-032 — Auto-scroll during drag · 🟡 · S [S24 — v1.18.0]
✅ B-033 — Drag saved+live item to Open Tabs → demote · 🟡 · S [S23 Wave 1 — merged df4a024 / PR #29]
🧊 B-034 — Window filter row (2+ windows) · 🟡 · S [absorbed into B-014]
✅ B-035 — Standalone window display mode · 🟡 · M [S28 — v1.22.0]
✅ B-036 — New tab page replacement (always-on) · ⚪ · L [S29 Wave 0 anchor — shipped always-on after B-039 drop, v1.23.0]
✅ B-037 — Theme selection (14 themes) · 🟡 · M [S31 anchor — v1.26.0]
✅ B-038 — View mode preference (side panel vs. standalone) · ⚪ · XS [S29 Wave 1 — R4 clean PROCEED]
🧊 B-039 — New tab page toggle preference · ⚪ · XS [S29 — DROPPED, MV3 constraint precludes true OFF state]
✅ B-040 — Sub-group auto-collapse preference · ⚪ · XS [S29 Wave 1 — R4 clean + canonical-key drift caught]
✅ B-041 — Sync this window to Chrome (snapshot push) · 🟡 · M [S42 anchor — v1.36.0]
✅ B-042 — Export to HTML (Netscape bookmarks) · 🟠 · M
✅ B-043 — Export to JSON backup · 🟠 · M
✅ B-044 — Import HTML with count preview & flattening · 🟠 · M
✅ B-045 — Import JSON with validation & repair · 🟠 · M
✅ B-046 — Global keyboard shortcuts (popup + standalone) · 🟠 · XS [S28 — v1.22.0 · reduced from S to XS at R1]
✅ B-047 — In-panel keyboard shortcuts (select-all, clear) · 🟠 · XS
✅ B-048 — Item visual states (live / active / drifted / audible / selected) · 🟠 · M
✅ B-049 — Empty states & error feedback · 🟠 · S
✅ B-050 — State broadcast to all extension surfaces · 🔴 · M
✅ B-051 — Sort-order normalisation & selection pruning · 🟠 · S
✅ B-052 — Fuzzy search index caching & perf targets · 🟠 · M
✅ B-053 — Break circular dep between partitions.js ↔ write-transaction.js (extract shapes module) · 🟡 · S
✅ B-054 — Sidepanel shell: item/group rendering + live states + click-to-navigate + broadcasts · 🔴 · L
✅ B-055 — Open Tabs section: render live-only ungrouped tabs in the sidepanel · 🟠 · M
🧊 B-056 — Visually distinguish unsavable tabs in Open Tabs section · 🟡 · S [replaced by B-061 per B-057 spike]
✅ B-057 — SPIKE: URL-scheme allowlist + duplicate-URL policy review · 🟡 · XL
✅ B-058 — Relax URL-scheme allowlist (chrome://, edge://, chrome-extension://, about:, view-source:) · 🟡 · S
✅ B-059 — Allow duplicate URLs with soft-warn UI · 🟡 · M
✅ B-060 — Import duplicate-handling with skip/allow override · 🟡 · S
✅ B-061 — Dim javascript:/data: rows in Open Tabs (replaces B-056) · ⚪ · XS
✅ B-062 — Dark-theme primary-button contrast audit (WCAG AA) · 🟠 · S
✅ B-063 — Close open context menu when the side panel loses focus (click-off) · 🟡 · S
✅ B-064 — Global `.item-url` tertiary-text contrast audit (WCAG AA) · 🟠 · S
✅ B-065 — Extract test-duplicated helpers to `shared/*` (tech-debt) · 🟡 · S
✅ B-066 — Remaining `--text-tertiary` a11y sweep (drag handle + empty states) · 🟡 · S
✅ B-067 — Flip export sanitizers to §32.5 allow-list before B-045 ships · 🟡 · S
✅ B-068 — Split SOLUTION_DESIGN + SPRINT_FINDINGS into per-chapter / per-sprint files · 🟠 · S
✅ B-069 — Add C-8 SW-context feasibility + C-9 empty-state design to R2 Correctness Checklist · 🟠 · XS
✅ B-070 — Sprint 18 follow-on polish bundle (prefs-only backup, alias removal, repair-summary rewrite, JSON dialog heading) · 🟡 · S

## Sprint 21 — Product-owner pivot: UAT essentials + polish close + feature-parity roadmap

> 6/6 done · 0 in progress · B-042 UAT essentials PASS (6/6 essential cases) · 8 plans deferred to S27 comprehensive sweep

✅ B-081 — New-group button in sidepanel header · 🟡 · XS [mid-sprint — merged 05a4049 / PR #25]
✅ B-077 — Add "DoR Gate 7 check" subsection to R1 AC template · 🟡 · XS [Wave 0 — merged fa1a8df / PR #26]
✅ B-078 — `breakCycles` adversarial-input hardening · 🟡 · XS [Wave 1 — merged fa1a8df / PR #26]
✅ B-079 — Query-length cap on filter input · 🟡 · XS [Wave 1 — merged fa1a8df / PR #26]
✅ B-080 — Repair-summary toast plain-language parity · ⚪ · XS [Wave 1 — merged fa1a8df / PR #26]
✅ B-082 — "Open side panel" button in toolbar popup · 🟠 · XS [S28 — v1.22.0]
✅ B-083 — Allow multiple sibling sub-groups under one parent (filter helper fix) · 🟠 · S [S25 — v1.19.0]
✅ B-084 — Refine drag drop-zone visual differentiation (reorder vs nest) · 🟡 · S [S25 — v1.19.0]
✅ B-085 — Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist · 🟠 · XS [S25 — v1.19.0]
⬜ B-086 — Sidepanel UI/UX design pass (post-feature-freeze polish) · ⚪ · M [filed S25 post-UAT; scheduled post-feature-parity]
✅ B-087 — Add C-11 "Popup-lifecycle message ordering" to R2 Correctness Checklist · 🟠 · XS [S27 Wave 1 — S26 retro HIGH action closed]

---

## Sprint 39 — Polish + drag UX (active)

> 6/6 done · Sprint 39 closing 2026-04-29 (release/v2 fast-forwarded after PR #41 merge; new branch `feature/sprint-39-polish`)

✅ B-124 — Floating-tab visual distinction (anchor #1) · ⚪ · M [S39 — Full DONE · dotted green bar + parameterized for future yellow swap · WCAG AA across 14 themes · hover save-CTA + distinct ARIA]
✅ B-122 — Sub-group drag-to-root (anchor #2) · 🟡 · M [S39 — Full DONE · root drop = anywhere outside group · same drag-line indicator · Open-Tabs reject-guard pre-emptive Wave 3a fix]
✅ B-123 — Item-row alignment (Wave 1 polish) · ⚪ · XS [S39 — Fast Track DONE · sidepanel-only fix per R1 R2-VERIFY · 6 new tests T1-T6]
✅ B-127 — R3 STOP-and-escalate gate for AC-locked deferrals (CLAUDE.md edit) · ⚪ · XS [S39 — Fast Track DONE · S38 retro HIGH action #1]
✅ B-128 — Split C-1 schema-bump vs data-migration (CLAUDE.md edit) · ⚪ · XS [S39 — Fast Track DONE · S38 retro MEDIUM action #2]
✅ B-129 — R3 cascade-prune sibling-grep gate (CLAUDE.md edit) · ⚪ · XS [S39 — Fast Track DONE · S38 retro MEDIUM action #3]

---

## Sprint 38 — Bug-fix anchor sprint (closed)

> 4/4 done · 0 in progress · Sprint 38 closed 2026-04-29 (v1.32.0 shipped via PR #41 merge to release/v2; UAT for B-125 + B-121 deferred to product owner; carried-forward UAT from S36+S37 still open)

✅ B-125 — Tab claim ownership jump on URL navigation (anchor #1) · 🔴 · M [S38 — Spike-First · `inheritedTabs` Set + reevaluateTab gate · 5 new tests]
✅ B-121 — Floating tab opener-chain inheritance regression (anchor #2) · 🟠 · M [S38 — Spike-First · `floatingMembers` on `MSG_LIST_ITEMS` · schema v1→v2 lazy-migration · 13 new tests · 1 CRIT + 4 HIGH fix-and-reproceed clean]
✅ B-120 — Stale-test-docblock prose corrections · ⚪ · XS [S38 — Fast Track · b114 + b104 docblocks corrected to post-B-117 values]
✅ B-126 — Expand B-119 contract for CSS-token invariants (CLAUDE.md edit) · 🟡 · XS [S38 — Fast Track · S37 retro HIGH action #1 closed]

---

## Sprint 37 — Polish + process close-out (closed)

> 3/3 done · 0 in progress · Sprint 37 closed 2026-04-28 (v1.31.0 release pending; UAT for B-117 carried forward; +1 B-120 follow-up filed mid-sprint)

✅ B-117 — §47.7 group-color WCAG AA matrix re-verification (anchor) · ⚪ · M [S37 — Full · §57 closed; UAT pending; +137 net tests; B-120 follow-up filed]
✅ B-118 — R1 source-citation gate (CLAUDE.md edit) · ⚪ · XS [S37 — Fast Track · CLAUDE.md:347-357]
✅ B-119 — R2 fix-scope test-assertion subsection (CLAUDE.md edit) · ⚪ · XS [S37 — Fast Track · CLAUDE.md:378-386]

---

## Sprint 36 — UI/UX polish bundle (planned)

> 9/9 done · 0 in progress · Sprint 36 closed 2026-04-28 (all UAT pending; v1.30.0 released)

✅ B-110 — Drifted-on-non-live BUG fix (§10.7 invariant violation) · 🟡 · M [S36 Wave 0 — §53 closed; UAT pending]
✅ B-107 — Live-X aria-label reactive flip (WCAG 2.1 SC 4.1.2) · ⚪ · XS [S36 Wave 0 — Fast Track]
✅ B-108 — Solarized-light secondary text AA fix · ⚪ · S [S36 Wave 0 — §54 closed; UAT pending]
✅ B-112 — Remove "Tab Junkie" label from sidepanel header · ⚪ · XS [S36 Wave 0 — Fast Track]
✅ B-114 — Group header tint v2 (brighter on dark themes) · ⚪ · XS [S36 Wave 0 — Fast Track]
✅ B-115 — Group-header chevron brightening (group-tinted) · ⚪ · XS [S36 Wave 0 — Fast Track]
✅ B-109 — Group header text colored to match group color · ⚪ · XS [S36 Wave 1 — light themes only via per-theme override; UAT pending]
✅ B-111 — Dynamic delete icon (X for live, trashcan for non-live) · ⚪ · S [S36 Wave 1 — §55 closed; UAT pending]
✅ B-113 — Item-row drag handle on hover + checkbox in multi-select · ⚪ · S [S36 Wave 1 — §56 closed; UAT pending]

---

## Sprint 35 — Bug-fix queue + tint-brightness polish

> 5/5 done · v1.29.0 shipped to release/v2 only (no main merge)

✅ B-100 — Delete-on-live UX redesign · 🟡 · M [S35 — R3-fix 3 HIGHs; +16 tests; B-107 follow-up filed]
✅ B-102 — Cross-window demote broadcast bug · 🟡 · M [S35 — shared §50 with B-103; +8 tests; multi-window UAT pending]
✅ B-103 — Promote-tab duplicate bug · 🟡 · S [S35 — R3 0 LOC inherited from B-102; +6 tests]
✅ B-105 — Solarized-light WCAG AA fix · 🟡 · S [S35 — `#546a71` text + 3% tint; +7 tests; B-108 follow-up filed]
✅ B-106 — Group header tint brightness 12% → 18% · ⚪ · XS [S35 Fast Track Wave 1 — depends on B-105; +1 test]

---

## Sprint 34 — Visual polish: group color cohesion + dotted drift bar

> 2/2 done · v1.28.0 shipped to release/v2 only (no main merge)

✅ B-104 — Themed group color system (colored headers + theme-aware 9-slot palette tokens) · 🟡 · M [S34 anchor — 153 `--gc-*` tokens, 5 hand-curated + 9 algorithmic, +9 tests; B-105 follow-up filed]
✅ B-101 — Dotted drift bar in row left-edge gutter (drops 16 px triangle) · ⚪ · S [S34 parallel — `_createDriftedIcon` deleted, `<span class="item-drift-bar">` always-present injection, +6 tests]

---

## Sprint 33 — Drift fix (Option B + reconcile action)

> 1/1 done · v1.27.0 shipped to release/v2 only (no main merge)

✅ B-099 — Drift fix: Option B (claim survives URL change) + "Snap to this tab" reconcile action · 🟠 · M [S33 anchor — bug latent since S1; +11 tests, 14/14 UAT PASS, 4 follow-ups filed]

---

## Pending Triage

> 0 items · all queued items absorbed into S36.

---

## Sprint 32 — Polish + hygiene cleanup

> 4/4 done · 0 in progress · Polish-only sprint closed · v1.26.0 shipped combined with S31

✅ B-088 — Hygiene bundle (cross-surface helper factor-out + carry-forwards) · 🟡 · S [S32 — R4 PROCEED, 8 fixes shipped, +4 perf regression tests, v1.26.0]
✅ B-096 — Sync `validatePreferences` import-validator with 14-slug enum · 🟡 · XS [S32 — R4 PROCEED, +10 tests, S31 security MEDIUM closed, v1.26.0]
✅ B-097 — Customizable keyboard shortcut for Settings · ⚪ · XS [S32 — R4 PROCEED, +18 tests, shared/settings-tab.js extracted, v1.26.0]
✅ B-098 — Tokyo Night theme (14th theme slip-in) · ⚪ · XS [S32 — additive palette, approved mid-S31, v1.26.0]

---

## Sprint 31 — Themes + process polish + popup Settings link

> 3/3 done · 0 in progress · v1.26.0 shipped combined with S32

✅ B-037 — Theme selection (14 themes) · 🟡 · M [S31 anchor — 14 themes shipped, v1.26.0]
✅ B-094 — Process polish bundle (R2 C-1 stale-SW + R1 selector-audit) · 🟡 · XS [S31 — S30 retro action closed, v1.26.0]
✅ B-095 — Toolbar popup → Settings link · ⚪ · XS [S31 — R4 PROCEED, +7 tests, v1.26.0]

---

## Sprint 30 — Settings page redesign + dense layout + import/export rehome

> 4/4 done · 0 in progress · v1.24.0 shipped

✅ B-091 — Settings page redesign (full-page surface) · 🟡 · L [S30 Wave 0 anchor — R5+UAT complete, v1.24.0]
✅ B-093 — Import/export controls rehome to Settings page · 🟡 · S [S30 Wave 1 — R4 PROCEED + 2 MED fixes; +13 tests]
✅ B-092 — Dense / compact layout toggle · ⚪ · XS [S30 Wave 1 — R4 PROCEED, +24 tests]
✅ B-090 — Add C-12 "Manifest declarations runtime-mutability" to R2 Correctness Checklist · 🟡 · XS [S30 Wave 0 — S29 retro HIGH action closed]

---

## Sprint 29 — New tab page + preferences surface

> 5/5 done + 1 dropped · v1.23.0 shipped · B-036 newtab always-on; B-039 dropped (MV3 constraint)

✅ B-089 — Settings panel scaffolding (prefs UI surface) · 🟡 · S [S29 Wave 0 — 1214 tests, 2 HIGH fixed]
✅ B-036 — New tab page replacement (always-on) · ⚪ · L [S29 Wave 0 anchor — shipped always-on after B-039 drop, v1.23.0]
✅ B-038 — View mode preference (side panel vs. standalone) · ⚪ · XS [S29 Wave 1 — R4 clean PROCEED]
🧊 B-039 — New tab page toggle preference · ⚪ · XS [S29 — DROPPED, MV3 constraint precludes true OFF state]
✅ B-040 — Sub-group auto-collapse preference · ⚪ · XS [S29 Wave 1 — R4 clean + canonical-key drift caught]

---

## Sprint 20 — Retro action items + polish debt + sub-group nesting

> 6/6 done · 0 in progress · UAT burndown track still pending (9 plans — B-007 joined the queue)

✅ B-071 — Gate 6 Sprint Readiness deps-resolved check (CLAUDE.md edit) · 🟠 · XS [Wave 0 — merged c2154c9 / PR #22]
✅ B-072 — AC template destructive-action confirmation clause (CLAUDE.md edit) · 🟡 · XS [Wave 0 — merged c2154c9 / PR #22]
✅ B-073 — Backfill C-6 + C-7 in R2 Correctness Checklist (CLAUDE.md edit) · 🟡 · XS [Wave 0 — merged c2154c9 / PR #22]
✅ B-074 — Remove pre-existing `TODO(sprint-19+)` from json-validator.js · 🟡 · XS [Wave 1 — merged a488c90 / PR #23; filed B-076 as deferral]
✅ B-075 — Convert B-052 `byId` Map → frozen plain object (§34.14 D-1) · ⚪ · XS [Wave 1 — merged a488c90 / PR #23]
⬜ B-076 — Apply MIGRATION_STEPS in-memory hook in JSON import validator (future-work placeholder) · 🟡 · S [activates when MIGRATION_STEPS ships first non-empty entry]

---

## Priority Distribution

| Priority | Count | % |
|----------|-------|---|
| 🔴 P0 Critical | 15 | 12% |
| 🟠 P1 High | 35 | 28% |
| 🟡 P2 Medium | 22 | 18% |
| ⚪ P3 Nice-to-have | 13 | 10% |

## Status Summary

| Status | Count | % |
|--------|-------|---|
| ✅ Done | 143 | 97% |
| 🔄 In Progress | 0 | 0% |
| ⬜ To Do | 5 | 3% |
| 🧊 Icebox | 3 | 2% |

(Done count: 143 post-S43 close. S43 shipped 7 items: B-149 hygiene, B-150 Q1, B-151/152/153 CLAUDE.md edits, B-154 multi-tab drag, B-156 rect-cache lifecycle fix, B-157 group-zone expansion. B-150 Q2 stays open — awaits real-world lost-sync repro signal. B-155 filed and deferred — Edge ghost regression follow-on. Total backlog 146 → 148 with B-155 + B-157 added; B-156 retroactively filed at the fix commit.)

**In Progress breakdown**: 0 items — sprint closed.

**To-Do breakdown (5 items)**:
- 🟠 **P1** (1): **B-150 Q2** lost-sync continuation (B-149 hypothesis mechanisms a/b/d still open; awaits real-world repro signal)
- 🟡 **P2** (2): B-076 MIGRATION_STEPS hook (S) · **B-138** post-B-137 cleanup (XS, DEFERRED)
- ⚪ **P3** (3): **B-135** cross-window Open Tabs drag · B-086 sidepanel UI/UX umbrella (M) · **B-148** interleave floating tabs + saved bookmarks (TBD) · **B-155** Edge multi-drag count-badge ghost (TBD, R0 candidate)

**To-Do breakdown (8 items)**:
- 🔴 **P1** (1 — Sprint 41 anchor candidate): **B-137** floatingGroups schema v3→v4 (adopt `floatingTabId` as primary live-tab join key; subsumes B-131)
- 🟡 **P2** (3): **B-138** post-B-137 cleanup (XS) · B-041 sync tab order (L) · B-076 MIGRATION_STEPS hook (S)
- ⚪ **P3** (4): **B-139** C-13 Chrome event-feedback completeness gate (CLAUDE.md edit) · **B-135** cross-window Open Tabs drag · B-086 sidepanel UI/UX umbrella (M) · (existing P3 items)

**To-Do breakdown (4 items)**:
- 🟡 **P2** (2): B-041 sync tab order (L) · B-076 MIGRATION_STEPS hook (S)
- ⚪ **P3** (2): **B-135** cross-window Open Tabs drag (deferred stub from B-134) · B-086 sidepanel UI/UX umbrella (M)

**To Do breakdown (3 items, S40+ candidates)**:
- **🟡 P2 (2)**: B-041 (sync tab order, L · pre-S33 — last big v2 feature), B-076 (MIGRATION_STEPS hook, S · pre-S33)
- **⚪ P3 (1)**: B-086 (sidepanel UI/UX umbrella, M · pre-S33)
