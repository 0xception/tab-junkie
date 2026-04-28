# Current Sprint

*Sprint 36 closed 2026-04-28 — v1.30.0 tagged on `release/v2`. Awaiting product-owner direction for next sprint.*

The Sprint 36 retrospective and per-item close notes have been archived to `docs/SPRINT_ARCHIVE.md` (search "Sprint 36"). All 9 items shipped pending product-owner UAT in Edge.

---

## Active Items

*None — sprint closed.*

---

## Completed This Sprint

*Archived to `docs/SPRINT_ARCHIVE.md`.*

---

## Blockers

*None.*

---

## Backlog (next sprint candidates)

Pending product-owner triage (see `docs/BACKLOG.md` for full details):

- **B-041** (sync tab order, P2/L · pre-S33) — last big v2 feature item; deserves its own sprint.
- **B-076** (MIGRATION_STEPS hook, P2/S · pre-S33) — passive future-work placeholder.
- **B-086** (sidepanel UI/UX umbrella, P3/M · pre-S33) — broader umbrella; could pair with B-041 post-S37.
- **B-117** (§47.7 matrix re-verification, P3/S · S36 follow-up) — pre-existing AA defect surfaced by S36 W1-A R3 (atom-one-dark + yellow ~2.81:1 against `--text-primary`). R0 spike scope.

Plus the deferred items inside B-115's R1 ("future B-116 = item-row color tinting if B-114+B-115 visual impact insufficient") and a handful of optional hygiene items surfaced by S36 R4 reviews (logged in §53.11 / §54.10 / §55.12 / §56.12 As-Built sections).

---

## Pending UAT (Sprint 36)

Product-owner manual UAT in Edge. Each item has its own UAT plan in the design chapter (or `docs/UAT_B-110.md`). Record results here once completed:

- **B-107** Live-X aria-label reactive flip — UAT pending
- **B-108** Solarized-light secondary text AA — UAT-1..UAT-5 pending (`docs/design/54-b-108-solarized-light-secondary-fix.md` §54.7)
- **B-109** Group-header text colored — UAT pending
- **B-110** Drift-on-non-live anchor — UAT-1..UAT-5 pending (`docs/UAT_B-110.md`)
- **B-111** Dynamic delete icon — UAT-1..UAT-5 pending (`docs/design/55-b-111-dynamic-delete-icon.md` §55.7)
- **B-112** Header label removed — UAT pending
- **B-113** Drag handle + checkbox swap — UAT-1..UAT-7 pending (`docs/design/56-b-113-drag-handle-multi-select.md` §56.7)
- **B-114** Brighter dark-theme tint v2 — UAT pending
- **B-115** Chevron themed color — UAT pending

---

## Pre-flight reminders for next sprint kickoff

When the product-owner approves the next sprint:
- [scrum-master] performs Gate 6 (Sprint Readiness) verification
- [product-manager] writes/refines R1 for each item — **with the new R1 quality gate from S36 retrospective: any claim about source code structure (line numbers, function bodies, selectors, file existence) must cite the verified source location OR be marked "R2-VERIFY"**
- [solution-architect] R2 chapters MUST include a "pre-existing test assertions to update" subsection when declaring a contract change (S36 retrospective action item)

Test count baseline: **1,504** (post-S36, post-v1.30.0).
