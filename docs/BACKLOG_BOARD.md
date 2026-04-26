# Tab Junkie — Product Board

**Updated:** 2026-04-26 · **Version:** 2.29 · **Total Items:** 105 · **Sprint 34 closed — v1.28.0 shipped to release/v2. Awaiting product-owner direction.**

---

## Progress Dashboard

```
Overall Progress    ██████████████████░░  90% (95/105)  [0 in progress · S34 closed]
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
⬜ B-041 — Sync tab order action (Chrome tab group sync) · 🟡 · L
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

## Sprint 34 — Visual polish: group color cohesion + dotted drift bar

> 2/2 done · v1.28.0 shipped to release/v2 only (no main merge)

✅ B-104 — Themed group color system (colored headers + theme-aware 9-slot palette tokens) · 🟡 · M [S34 anchor — 153 `--gc-*` tokens, 5 hand-curated + 9 algorithmic, +9 tests; B-105 follow-up filed]
✅ B-101 — Dotted drift bar in row left-edge gutter (drops 16 px triangle) · ⚪ · S [S34 parallel — `_createDriftedIcon` deleted, `<span class="item-drift-bar">` always-present injection, +6 tests]

---

## Sprint 33 — Drift fix (Option B + reconcile action)

> 1/1 done · v1.27.0 shipped to release/v2 only (no main merge)

✅ B-099 — Drift fix: Option B (claim survives URL change) + "Snap to this tab" reconcile action · 🟠 · M [S33 anchor — bug latent since S1; +11 tests, 14/14 UAT PASS, 4 follow-ups filed]

---

## Pending Triage (filed from S33-S34, awaiting sprint placement)

> 4 items · all P2 · candidates for S35 or later

⬜ B-100 — Delete-on-live UX: Delete should default to Close-tab when item is live · 🟡 · M [filed S33 UAT-2 user feedback]
⬜ B-102 — Cross-window demote broadcast bug: item vanishes from non-originating windows · 🟡 · M [filed S33 UAT-13 user feedback]
⬜ B-103 — Promote-tab duplicate bug: tab shown as both bookmark AND open-tab after promote · 🟡 · S [filed S33 UAT-13 user feedback]
⬜ B-105 — Solarized-light theme baseline WCAG AA contrast defect (4.392:1 sub-AA before any tint) · 🟡 · S [filed S34 B-104 R4 qa-reviewer; B-104 worked around via 0% tint; B-105 fixes underlying palette]

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
| 🔴 P0 Critical | 14 | 15% |
| 🟠 P1 High | 34 | 37% |
| 🟡 P2 Medium | 20 | 22% |
| ⚪ P3 Nice-to-have | 8 | 8% |

## Status Summary

| Status | Count | % |
|--------|-------|---|
| ✅ Done | 95 | 90% |
| 🔄 In Progress | 0 | 0% |
| ⬜ To Do | 7 | 7% |
| 🧊 Icebox | 3 | 3% |

**To Do breakdown (7 items)**: B-041 (sync tab order, P2/L · pre-S33), B-076 (MIGRATION_STEPS hook, P2/S · pre-S33), B-086 (sidepanel UI/UX design pass, P3/M · pre-S33 umbrella), B-100 (delete-on-live UX, P2/M · S33 follow-up), B-102 (cross-window demote bug, P2/M · S33 follow-up), B-103 (promote duplicate bug, P2/S · S33 follow-up), B-105 (solarized-light baseline WCAG AA contrast, P2/S · S34 follow-up).
