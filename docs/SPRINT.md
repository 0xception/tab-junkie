# Current Sprint

**No active sprint.** Sprint 38 closed 2026-04-29 — v1.32.0 cut on `release/v2` (commit `d9869ff`). Full Sprint 38 record (per-item close notes, Gate 4 release checklist, Gate 7 retrospective, lessons captured, files changed summary) archived to `docs/SPRINT_ARCHIVE.md`.

---

## Active Items

*None — sprint closed.*

---

## Blockers

*None.*

---

## Pending UAT (Sprint 36 + Sprint 37 + Sprint 38 — carry-forward)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0 + v1.32.0. Not blocking sprint close per established pattern, but should be cleared before any v2 → main merge.

- **Sprint 36 (v1.30.0)**: B-107, B-108, B-109, B-110, B-111, B-112, B-113, B-114, B-115 — all UAT pending
- **Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
- **Sprint 38 (v1.32.0)**: B-125 UAT-1..UAT-8 pending (`docs/UAT_B-125.md`) · B-121 UAT-1..UAT-15 pending (`docs/UAT_B-121.md`)

---

## Backlog (Sprint 39+ candidates)

User to triage usability/features/bugs before tab-syncing path. Pending list (carried over from S38 close):

- **B-122** (sub-group drag-to-root, P2/S · S37 follow-up · feature gap)
- **B-041** (sync tab order, P2/L · pre-S33) — last big v2 feature; deserves its own sprint
- **B-076** (MIGRATION_STEPS hook, P2/S · pre-S33) — passive future-work placeholder
- **B-086** (sidepanel UI/UX umbrella, P3/M · pre-S33)
- **B-123** (item-row alignment, P3/XS · S37 follow-up)
- **B-124** (floating-tab visual distinction, P3/S · S37 follow-up · design Q&A required at R1; depends on B-121 close — now unblocked post-S38)
- **NEW from S38 retro** (3 CLAUDE.md edit follow-ups — to be filed as B-127/B-128/B-129):
  - R3 "future enhancement" deferral STOP-and-escalate gate [HIGH]
  - R2 schema-version-bump vs data-migration split into 2 checkboxes [MEDIUM]
  - R3 cascade-prune sibling-grep gate (multi-entry-point write surfaces) [MEDIUM]
- **User-flagged**: "a few other usability/features/bugs to address before tab syncing" — TO BE FILED by user

---

## Pre-flight reminders for next sprint kickoff

When the product-owner approves Sprint 39:
- [scrum-master] performs Gate 6 (Sprint Readiness) verification including the **deps-resolved check** (Gate 6 item 6) for any items depending on Sprint 38 closes (e.g., B-124 now unblocked since B-121 closed)
- [product-manager] applies the **B-118 source-citation gate** (shipped S37, validated S38): every R1 source-code claim must cite `file:line` or be marked `R2-VERIFY`
- [solution-architect] R2 chapters MUST include the **B-119 + B-126 fix-scope test-assertion enumeration** subsection (covers DOM/ARIA/message/selector/CSS-token/storage-schema contracts)
- S38 retro action items (#1 STOP-and-escalate, #2 schema-bump split, #3 cascade-prune sibling grep) should be filed as B-127/B-128/B-129 before kickoff if S39 has process-polish capacity

Test count baseline post-S38: **1,663**.
