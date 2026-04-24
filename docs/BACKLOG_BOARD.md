# Tab Junkie — Product Board

**Updated:** 2026-04-23 · **Version:** 2.18 · **Total Items:** 87 · **Sprint 27 closed — v1.21.0 (B-023 group-jump popup + B-087 C-11 checklist); S28 TBD**

---

## Progress Dashboard

```
Overall Progress    █████████████████░░░  89% (77/87)  [0 in progress · S28 next]
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
⬜ B-035 — Standalone window display mode · 🟡 · M
⬜ B-036 — New tab page replacement (optional) · ⚪ · L
⬜ B-037 — Theme selection (≥12 themes) · 🟡 · M
⬜ B-038 — View mode preference (side panel vs. standalone) · ⚪ · XS
⬜ B-039 — New tab page toggle preference · ⚪ · XS
⬜ B-040 — Sub-group auto-collapse preference · ⚪ · XS
⬜ B-041 — Sync tab order action (Chrome tab group sync) · 🟡 · L
✅ B-042 — Export to HTML (Netscape bookmarks) · 🟠 · M
✅ B-043 — Export to JSON backup · 🟠 · M
✅ B-044 — Import HTML with count preview & flattening · 🟠 · M
✅ B-045 — Import JSON with validation & repair · 🟠 · M
⬜ B-046 — Global keyboard shortcuts (popup + standalone) · 🟠 · S [deferred — requires B-022 + B-035 to ship first]
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
⬜ B-082 — "Open side panel" button in toolbar popup · 🟠 · XS [filed mid-sprint per FEATURE_PARITY_ROADMAP; scheduled S26]
✅ B-083 — Allow multiple sibling sub-groups under one parent (filter helper fix) · 🟠 · S [S25 — v1.19.0]
✅ B-084 — Refine drag drop-zone visual differentiation (reorder vs nest) · 🟡 · S [S25 — v1.19.0]
✅ B-085 — Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist · 🟠 · XS [S25 — v1.19.0]
⬜ B-086 — Sidepanel UI/UX design pass (post-feature-freeze polish) · ⚪ · M [filed S25 post-UAT; scheduled post-feature-parity]
✅ B-087 — Add C-11 "Popup-lifecycle message ordering" to R2 Correctness Checklist · 🟠 · XS [S27 Wave 1 — S26 retro HIGH action closed]

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
| 🔴 P0 Critical | 14 | 17% |
| 🟠 P1 High | 34 | 41% |
| 🟡 P2 Medium | 16 | 20% |
| ⚪ P3 Nice-to-have | 6 | 7% |

## Status Summary

| Status | Count | % |
|--------|-------|---|
| ✅ Done | 77 | 89% |
| 🔄 In Progress | 0 | 0% |
| ⬜ To Do | 8 | 9% |
| 🧊 Icebox | 2 | 2% |
