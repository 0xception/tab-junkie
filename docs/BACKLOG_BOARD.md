# Tab Junkie — Product Board

**Updated:** 2026-04-19 · **Version:** 2.0 · **Total Items:** 69

---

## Progress Dashboard

```
Overall Progress    █████████████░░░░░░░  70% (48/69)  [2 in progress]
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
⬜ B-007 — Sub-group nesting (depth = 1) · 🟠 · M
✅ B-008 — Group reorder & collapse / expand persistence · 🟠 · M
⬜ B-009 — Drag-to-expand collapsed group · 🟡 · S
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
⬜ B-022 — Quick search popup with keyboard navigation · 🟠 · L
⬜ B-023 — Group jump popup · 🟠 · L
✅ B-024 — Multi-select + bulk action bar · 🟠 · M
⬜ B-025 — Multi-item drag as single unit · 🟠 · M
✅ B-026 — Item context menu · 🟠 · S
✅ B-027 — Group header context menu · 🟠 · S
✅ B-028 — Selection context menu · 🟠 · S
✅ B-029 — Group picker modal · 🟠 · M
⬜ B-030 — Item drag-reorder within / between groups · 🟠 · L
⬜ B-031 — Group drag-reorder & nesting via drag · 🟠 · M
⬜ B-032 — Auto-scroll during drag · 🟡 · S
⬜ B-033 — Drag saved+live item to Open Tabs → demote · 🟡 · S
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
🔄 B-044 — Import HTML with count preview & flattening · 🟠 · M
🔄 B-045 — Import JSON with validation & repair · 🟠 · M
⬜ B-046 — Global keyboard shortcuts (popup + standalone) · 🟠 · S
✅ B-047 — In-panel keyboard shortcuts (select-all, clear) · 🟠 · XS
✅ B-048 — Item visual states (live / active / drifted / audible / selected) · 🟠 · M
✅ B-049 — Empty states & error feedback · 🟠 · S
✅ B-050 — State broadcast to all extension surfaces · 🔴 · M
✅ B-051 — Sort-order normalisation & selection pruning · 🟠 · S
⬜ B-052 — Fuzzy search index caching & perf targets · 🟠 · M
✅ B-053 — Break circular dep between partitions.js ↔ write-transaction.js (extract shapes module) · 🟡 · S
✅ B-054 — Sidepanel shell: item/group rendering + live states + click-to-navigate + broadcasts · 🔴 · L
✅ B-055 — Open Tabs section: render live-only ungrouped tabs in the sidepanel · 🟠 · M
🧊 B-056 — Visually distinguish unsavable tabs in Open Tabs section · 🟡 · S [replaced by B-061 per B-057 spike]
✅ B-057 — SPIKE: URL-scheme allowlist + duplicate-URL policy review · 🟡 · XL
✅ B-058 — Relax URL-scheme allowlist (chrome://, edge://, chrome-extension://, about:, view-source:) · 🟡 · S
✅ B-059 — Allow duplicate URLs with soft-warn UI · 🟡 · M
⬜ B-060 — Import duplicate-handling with skip/allow override · 🟡 · S
✅ B-061 — Dim javascript:/data: rows in Open Tabs (replaces B-056) · ⚪ · XS
✅ B-062 — Dark-theme primary-button contrast audit (WCAG AA) · 🟠 · S
✅ B-063 — Close open context menu when the side panel loses focus (click-off) · 🟡 · S
✅ B-064 — Global `.item-url` tertiary-text contrast audit (WCAG AA) · 🟠 · S
✅ B-065 — Extract test-duplicated helpers to `shared/*` (tech-debt) · 🟡 · S
✅ B-066 — Remaining `--text-tertiary` a11y sweep (drag handle + empty states) · 🟡 · S
✅ B-067 — Flip export sanitizers to §32.5 allow-list before B-045 ships · 🟡 · S
✅ B-068 — Split SOLUTION_DESIGN + SPRINT_FINDINGS into per-chapter / per-sprint files · 🟠 · S

---

## Priority Distribution

| Priority | Count | % |
|----------|-------|---|
| 🔴 P0 Critical | 14 | 25% |
| 🟠 P1 High | 31 | 54% |
| 🟡 P2 Medium | 8 | 14% |
| ⚪ P3 Nice-to-have | 4 | 7% |

## Status Summary

| Status | Count | % |
|--------|-------|---|
| ✅ Done | 48 | 70% |
| 🔄 In Progress | 2 | 3% |
| ⬜ To Do | 17 | 25% |
| 🧊 Icebox | 2 | 3% |
