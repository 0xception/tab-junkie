# Tab Junkie — Feature Parity Roadmap

**Created**: 2026-04-20 · **Author**: [scrum-master] with product-owner approval
**Status**: Active — drives sprint planning S22 through S27
**Source decision**: Sprint 21 product-owner pivot (UAT_B-042.md, commit `8cf8e2c`) — defer comprehensive UAT to a dedicated sweep after all feature-parity items ship. Light smoke UAT (5–10 cases) per feature keeps breakage-triage manageable without per-plan burndown cost.

---

## Product-owner-defined feature parity scope

All items below must be **shipped and smoke-tested** before the comprehensive UAT sweep in S27.

### Drag-and-drop (P1 + P2 helpers)

**S22 ↔ S23 swap (2026-04-20, Gate 6 correction)**: B-030 dep foundation ordering.

**S22 B-030 revert (2026-04-21, UAT-surfaced perf + correctness regression)**: B-030 shipped in S22 Wave 0 (PR #27, commit `bfe0559`), then reverted the next day after UAT smoke test found (a) same-group reorder silently dropped drops and (b) cumulative drag-over lag that also regressed B-008. All S22 drag work slipped by **one sprint**. B-030 returns to `backlog` for S23 re-architecting with perf as a first-class concern (rAF coalescing + cached rects encoded as R3 guardrails, not R2 notes). S23+ shift down one.

| ID | Item | Priority | Effort | Sprint (updated) |
|----|------|----------|--------|-------------------|
| B-030 | Item drag-reorder within / between groups | 🟠 P1 | L | **S23 (foundation v2 — re-architected)** |
| B-009 | Drag-to-expand collapsed group | 🟡 P2 | S | **S23** |
| B-033 | Drag saved+live item to Open Tabs → demote | 🟡 P2 | S | **S23** |
| B-025 | Multi-item drag as single unit | 🟠 P1 | M | **S24 (drag stack)** |
| B-031 | Group drag-reorder & nesting via drag | 🟠 P1 | M | **S24** |
| B-032 | Auto-scroll during drag | 🟡 P2 | S | **S24** |

### Popups (P1)

| ID | Item | Priority | Effort | Sprint (updated) |
|----|------|----------|--------|-------------------|
| B-022 | Quick search popup with keyboard navigation | 🟠 P1 | L | **S25** (was S24) |
| B-023 | Group jump popup | 🟠 P1 | L | **S26** (was S25) |

### New page / tab views

| ID | Item | Priority | Effort | Sprint (updated) |
|----|------|----------|--------|-------------------|
| B-035 | Standalone window display mode | 🟡 P2 | M | **S26** (was S25) |
| B-036 | New tab page replacement | ⚪ P3 | L | **S27** (was S26) |
| B-038 | View mode preference (side panel vs. standalone) | ⚪ P3 | XS | **S27** (was S26) |
| B-039 | New tab page toggle preference | ⚪ P3 | XS | **S27** (was S26) |
| B-040 | Sub-group auto-collapse preference | ⚪ P3 | XS | **S27** (was S26) |

### Shortcuts + popup entry point

| ID | Item | Priority | Effort | Sprint (updated) |
|----|------|----------|--------|-------------------|
| B-046 | Global keyboard shortcuts | 🟠 P1 | S | **S27** (was S26) — unblocked by B-022 + B-035 landing first |
| B-082 | "Open side panel" button in toolbar popup | 🟠 P1 | XS | **S27** (was S26) — primary scope (b); shortcut path (c) covered by B-046 |

### Explicitly deferred (post-feature-parity, not in scope)

- **B-037 Theme selection (≥ 12 themes)** — P2, M. Product-owner confirmed **not** parity-critical.
- **B-041 Sync tab order** — P2, L. Niche, deferred.

---

## Sprint-by-sprint plan

### Sprint 21 (current — clean close)

**Theme**: Polish burndown from Sprint 19+20 queue. UAT essentials verified for B-042. Pivot to feature-parity roadmap.

**Shipping**:
- B-077 DoR Gate 7 check subsection (XS, CLAUDE.md edit)
- B-078 `breakCycles` adversarial-input hardening (XS)
- B-079 Query-length cap on filter input (XS)
- B-080 Repair-summary toast plain-language parity (XS)
- B-081 New-group button in sidepanel header (XS — already shipped mid-sprint `05a4049`)
- B-042 UAT essentials PASS (6/6 essential cases; 8 non-essential SKIP → deferred to S27)

**Release**: **v1.16.0**

### Sprint 22 — CLOSED without release (drag foundation reverted)

B-030 shipped then reverted mid-sprint (UAT-surfaced perf + correctness). See `docs/SPRINT_ARCHIVE.md` Sprint 22 entry for the retrospective + action items. Zero features released; v1.16.0 remains the live production tag.

### Sprint 23 — Drag foundation v2 (1L + 2S)

**Theme**: Drag foundation re-architected after the Sprint 22 revert. Perf specs from R2 become R3 code guardrails this time (rAF-coalesced dragover handler, cached bounding rects per drag). Per-feature smoke UAT authored in R1, not deferred. Same scope as S22 attempt.

**Shipping**:
- **B-030 L** Item drag-reorder within / between groups (re-architected; dedicated Edge debug pass at R3 for same-group reorder correctness)
- **B-009 S** Drag-to-expand collapsed group
- **B-033 S** Drag saved+live item to Open Tabs → demote

**Smoke UAT per item** (~5–10 cases each) — authored in R1, includes perf probes (continuous drag duration, getBoundingClientRect call count).

**Release**: **v1.17.0** (first release after S22 zero-release close).

**Parallelization rules applied**:
- P-1: one L (B-030) — max, no other L/XL ✅
- P-2: S items (B-009 + B-033) pair with L ✅

### Sprint 24 — Drag stack (2M + 1S)

**Theme**: Drag features that sit ON the B-030 foundation: multi-item selection drag + group-level drag-reorder-and-nest (extends B-007 + reuses `filterGroupParentCandidates`) + auto-scroll helper.

**Shipping**:
- **B-025 M** Multi-item drag as single unit (depends on B-030 drag infrastructure)
- **B-031 M** Group drag-reorder & nesting via drag (depends on B-030 + B-007 + `filterGroupParentCandidates` helper from Sprint 20)
- **B-032 S** Auto-scroll during drag (depends on B-030)

**Smoke UAT per item**: same shape as S22.

**Release**: **v1.18.0**

**Parallelization**:
- P-1: zero L/XL ✅
- P-3: two M in parallel (B-025 + B-031) — threshold hit, no more M ✅
- P-2: S (B-032) pairs with either M ✅

### Sprint 25+ — renumbered per S22 revert

S24 (quick search popup), S25 (group jump + standalone), S26 (shortcuts + prefs + new tab page), S27 (comprehensive UAT sweep), S28 (TBD v2→main) all shift **one sprint later** than the original roadmap. Sprint contents unchanged; sprint numbers + release versions update to reflect the S22 revert. See individual sprint tables above for the new sprint assignments per item.

### Sprint 24 — Quick search popup (1L)

**Theme**: `chrome.action` popup upgrade — spotlight-style quick search across items + tabs with keyboard navigation.

**Shipping**:
- **B-022 L** Quick search popup with keyboard navigation (5 days of focused work)

**Smoke UAT**: happy path · keyboard · Empty results · "no match" state · dismiss behaviour (Escape + click-off) · perf (300+ items).

**Release**: **v1.19.0**

### Sprint 25 — Group jump popup + Standalone window (1L + 1M)

**Theme**: Group jump popup (fast navigation to a group) + standalone window display mode (alternate entry point for users who don't want the side panel).

**Shipping**:
- **B-023 L** Group jump popup
- **B-035 M** Standalone window display mode

**Smoke UAT per item**: popup open/close/keyboard · standalone open/close/resize/persistence.

**Release**: **v1.20.0**

**Parallelization**:
- P-1: one L (B-023) — max
- M (B-035) pairs with L

### Sprint 26 — Shortcuts + prefs + new tab page (1S + 3XS + 1XS + optional L)

**Theme**: Keyboard shortcuts registration (unblocked now that B-022 + B-035 have shipped) + preference surfaces + new tab page replacement (P3 optional — product-owner included).

**Shipping**:
- **B-046 S** Global keyboard shortcuts — registers `_execute_action` + page commands in `manifest.json`. User-bound shortcuts via `edge://extensions/shortcuts`.
- **B-082 XS** "Open side panel" button in toolbar popup. Primary (b) — popup button. Shortcut path (c) covered by B-046's `_execute_action` binding.
- **B-038 XS** View mode preference (side panel vs. standalone)
- **B-039 XS** New tab page toggle preference
- **B-040 XS** Sub-group auto-collapse preference
- **B-036 L** New tab page replacement (P3 optional — **INCLUDED** per product-owner)

**Smoke UAT**: keyboard-shortcut flow (Ctrl+J → popup → Tab → Enter → side panel) · each preference toggle + persistence · new tab page render + nav.

**Release**: **v1.21.0**

**Parallelization caveat**: B-036 is a second L in a crowded sprint. If S26 runs hot, **defer B-036 to S27** as a finishing item (S27 is UAT-focused, has more capacity for a late-break L). Decision point at S26 mid-sprint.

### Sprint 27 — Comprehensive UAT sweep (all 9 plans + every S22–S26 feature)

**Theme**: Full UAT pass — no new features. Every deferred case + every per-feature smoke UAT rolled into a comprehensive coverage check.

**Activities**:
- Execute full 9 UAT plans (B-042 UAT-9..14 deferred + B-043 + B-044 + B-045 + B-048 + B-029 + B-007 + B-059 + B-052) — the original ~163 cases that Sprint 21 deferred.
- Execute light smoke UAT for every item shipped in S22–S26 (B-025, B-031, B-032, B-030, B-009, B-033, B-022, B-023, B-035, B-046, B-082, B-038, B-039, B-040, B-036 = ~15 smoke plans × 5–10 cases each = ~100 cases).
- Total UAT scope: **~260 cases**. Expect to run over 2–3 working days of user execution time.
- Any FAIL → triage: trivial bug fix in-sprint, non-trivial filed and scheduled for a fix sprint (S28a) before merge.

**Release**: **v1.22.0** (tagged as the release candidate for v2→main merge).

### Sprint 28 — TBD (v2 → main merge decision)

**Product-owner review point**: after S27 UAT sweep completes, product-owner reviews the comprehensive UAT results + any outstanding FAIL triage + the full v2 feature set. Decision:
- **(a)** Merge `release/v2` → `main`, archive v1 — ship v2.0.0.
- **(b)** Do a fix sprint (S28a) to clear FAIL triage, then re-run the affected UAT plans, then merge.
- **(c)** Identify further gaps and extend the feature roadmap.

**This roadmap does not pre-commit to option (a)** — the user explicitly paused the v2→main decision pending S27 results.

---

## Per-feature smoke UAT protocol (S22 through S26)

Every feature ships with a `docs/UAT_B-NNN.md` smoke plan containing **5–10 cases** covering:

| Coverage area | Cases |
|---------------|-------|
| Happy path (AC1-2) | 1–2 |
| Keyboard accessibility | 1 |
| Edge cases visible in the feature's AC output | 2–3 |
| Error / rejection paths | 0–2 (if applicable) |
| Security / data-integrity | 0–1 (if applicable) |

**Execution cadence**: after each feature's R5 automated tests land and before sprint close. Product-owner walks the 5–10 cases in the same session-based format used for B-042 (Sprint 21).

**Full comprehensive plans** (the 15–30-case originals) are **not** deleted — they stay on disk as the S27 target. Smoke UAT is additive, not a replacement.

---

## Velocity + calendar assumptions

- Roadmap assumes **~1 sprint ≈ 1–2 working days** of assistant pace (matches Sprint 18 through Sprint 20 cadence).
- Sprints 22–26 each ship a release (`v1.17.0` through `v1.21.0`). Sprint 27 ships the UAT-gated release candidate (`v1.22.0`).
- Calendar-wise: feature parity ≈ **6 more sprints** ≈ 1–2 weeks of focused work at current pace. S27 UAT sweep adds 2–3 days.

---

## Rollback / scope-change contingencies

- **If a drag sprint (S22 or S23) hits R4 findings > 4 HIGH**: split into a fix sub-sprint; do not push through. Drag is interaction-heavy and regressions compound.
- **If B-022 Quick search popup (S24) exceeds L**: auto-upgrade to Spike-First per CLAUDE.md Tier 3 — R0 spike before R1 if scope explodes.
- **If S26 runs hot with B-036 L included**: defer B-036 to S27 as documented above. S26 minimum must ship B-046 + B-082 + B-038/039/040 — those are non-negotiable for the "shortcut to open side panel" parity requirement.

---

## Sources + references

- **Decision commit**: `8cf8e2c` — "chore: record B-042 UAT — essentials PASS (6/6); Sprint 21 pivots to feature parity"
- **Sprint 20 retro HIGH rule** (superseded for Sprint 21 only): `docs/SPRINT_ARCHIVE.md` — "UAT burndown as first-class sprint item, no forward feature until ≥ 4 UAT plans PASS"
- **Current backlog**: `docs/BACKLOG.md` — all 16 items enumerated above are currently `⬜ backlog`
- **CLAUDE.md parallelization rules**: P-1 / P-2 / P-3 applied to every sprint plan above
