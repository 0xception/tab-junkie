# Current Sprint

*Sprint 34 — Visual polish: group color cohesion + dotted drift bar. Planned 2026-04-26. **Awaiting product-owner approval to kick off R1.***

Two-item visual-polish sprint targeting v1.28.0. Both items are pure UI/UX refinement — zero storage schema changes, zero new permissions, zero new message types. Ships to `release/v2`. No main merge — that remains a manual product-owner task.

---

## Gate 6 — Sprint Readiness (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | Both sprint items have passed Definition of Ready | ⏳ — B-101 R1 LOCKED in pre-S34 brainstorm; B-104 R1 has open Q1-Q6 (locks at R1 by [product-manager]) |
| 2 | Total sprint effort fits the sprint duration | ✅ — 1 M (B-104) + 1 S (B-101) — well within Full sprint capacity |
| 3 | No unresolved blockers from S33 | ✅ — S33 closed clean, 4 follow-ups filed in triage |
| 4 | `SPRINT.md` "Active Items" populated | ✅ (below) |
| 5 | `BACKLOG.md` items filed | ✅ — B-104 NEW (M); B-101 refined with locked design (S) |
| 6 | `BACKLOG_BOARD.md` updated | ✅ — Sprint 34 section added; totals refreshed (104 items, 89% complete) |
| 7 | Deps-resolved check | ✅ — B-101: deps B-099 ✅. B-104: deps B-006 ✅ + B-037 ✅. Both fully resolved. |

**Pending product-owner approval before R1 launch.**

---

## Active Items

### [B-104] Themed group color system (colored headers + theme-aware palette tokens)
- **Tier**: Full (M) — R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
- **Status**: Backlog filed; awaiting R1 launch
- **Wave**: 0 (anchor)
- **Feature Context**:
  - Group headers currently show only a small color chip; user wants the whole header tinted with the group's chosen color for at-a-glance group identity.
  - The 9-slot semantic palette (red/blue/green/...) currently uses fixed values; user wants per-theme resolution so "red" looks Dracula-red in Dracula and GitHub-red in GitHub Light. Visual cohesion across all 14 themes.
  - Identity stays semantic (slot names, not hex); rendering becomes theme-aware via `shared/themes.css` token additions (9 slots × 14 themes = 126 token values).
- **Dependencies**: B-006 ✅ (group palette enforcement), B-037 ✅ (14-theme system + `shared/themes.css` token catalog)
- **Open R1 questions** (to be locked by [product-manager]):
  - Q1: Header tint treatment — full-bleed bg, top-border, left-border-extend, gradient stripe?
  - Q2: Slot naming scheme (verify against current `validateGroup` color allowlist in `background/storage/groups.js`)
  - Q3: Migration strategy if existing colors are stored as hex (vs. slot names)
  - Q4: Coverage scope — sidepanel + newtab + group-jump popup, or sidepanel only?
  - Q5: Per-theme color authoring approach — hand-curated for top 4 themes + algorithmic fallback for the other 10, or full hand-curation?
  - Q6: Group color picker swatch theme-awareness (must show user the same color they'll see in the header)
- **Files (expected)**:
  - `shared/themes.css` — 9 new color tokens × 14 themes = ~126 new values
  - `background/storage/groups.js` — color allowlist normalization (if migration needed per Q3)
  - `sidepanel/sidepanel.css` — `.group-header` tint rule consuming new tokens
  - `sidepanel/sidepanel.js` — apply group color via inline style or CSS custom property
  - `newtab/newtab.css` + `newtab/newtab.js` — same treatment if Q4 includes newtab
  - `popup/group-jump-popup.css` + `.js` — same treatment if Q4 includes group-jump
  - `components/group-edit-dialog.{js,css}` — picker swatches consume new tokens
  - `tests/b104-group-colors.test.js` (new, ≥ 8 tests)
  - `docs/UAT_B-104.md` (new, ≥ 6 cases)
  - `docs/design/47-b-104-themed-group-colors.md` (new R6 chapter)
- **Parallel Opportunity**: R4 — code + security + qa reviewers in parallel after R3
- **Risk flags**:
  - 126-value palette authoring in R3 is the largest LOC item. R2 should pre-decide hand-curation vs. algorithmic to scope R3 accurately.
  - WCAG AA contrast needs spot-checking across 9 colors × 14 themes (126 combinations) — R5 picks a representative sample (~20 spot-checks) rather than all 126.

### [B-101] Dotted drift bar in row left-edge gutter
- **Tier**: Full (S) — R1 (already LOCKED) → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7
  - *Note: tier upgraded from Fast Track (S default) to Full (S) because R5 + R6 are valuable for visual-treatment items where regression coverage matters; this is the [scrum-master]'s call per CLAUDE.md tier rules. UAT also useful given the indicators-strip pattern is shared with audible/active rendering.*
- **Status**: R1 LOCKED in pre-S34 brainstorm with product-owner (2026-04-26); awaiting R2 launch
- **Wave**: 0 (parallel to B-104; independent — touches drift indicator only, not group colors)
- **Feature Context**:
  - Replaces the B-099 16 px warning-triangle drift icon with a 3 px dotted vertical bar in the row's left-edge gutter, stacked parallel to the existing `data-active="true"` solid green border-left.
  - When row is BOTH active AND drifted, two bars render side-by-side (3 px solid green + 3 px dotted amber = ~6 px gutter).
  - Drift no longer occupies a slot in the indicators strip — strip returns to: window badge → audible icon (only).
  - Hostname tooltip + `aria-label` migrate from triangle to the new bar element.
  - Sidepanel + standalone surfaces only; newtab dot stays as-is (separate row layout doesn't have an active-line gutter).
- **Dependencies**: B-099 ✅ (drift behavior + indicator infrastructure shipped)
- **R1 LOCKED decisions** (verbatim from BACKLOG.md):
  - Q1 LOCKED: stacked dotted bar in left gutter, `border-left: 3px dotted var(--drifted-color)`
  - Q2 LOCKED: 16 px triangle REMOVED from indicators strip
  - Q3 LOCKED: tooltip migrates to bar element (sibling `<span>`, not pseudo-element — pseudo-elements can't carry `title`)
  - Q4 LOCKED: sidepanel + standalone only; newtab + popup unchanged
  - **Destructive-action confirmation (DoR item 7)**: N/A — visual refinement only
- **Files (expected)**:
  - `sidepanel/sidepanel.js` — `_createDriftedIcon` deleted; `buildItemRow` indicator-strip block edit; `_ensureIndicators` signature extended with `driftedToUrl`; new `<span class="item-drift-bar">` injection
  - `sidepanel/sidepanel.css` — `.item-drift-bar` positioning rule (R2 confirms exact strategy); `.item-drifted-icon` rule deletion
  - `sidepanel/sidepanel.html` — no change expected; bar is JS-injected per row
  - `tests/b101-drift-bar.test.js` (new, ≥ 5 tests T1-T5)
  - `docs/UAT_B-101.md` (new, ≥ 4 cases)
  - `docs/design/48-b-101-drift-bar.md` (new R6 chapter)
- **R2 questions to confirm**:
  - Exact positioning strategy: pseudo-element on `.item-row` vs. injected `<span>`. Locked Q3 implies `<span>` (tooltip carrier).
  - `.item-row` `position: relative` requirement — verify or add.
  - Whether row-level `aria-label` (line 2382) keeps "drifted" or moves it onto the bar.
- **Parallel Opportunity**: B-104 R3 + B-101 R3 can run in parallel (different files; B-101 touches drift-only, B-104 touches group-only). R4 launches per-item independently.

---

## Wave Plan

```
Wave 0 (both items in parallel — independent surfaces)
  ├── B-104 R1 → R2 → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7    [Full M]
  └── B-101 R2 (R1 already locked) → R3 → R4 (3 reviewers parallel) → R5 → R6 → R7    [Full S]

Sprint Close
  Gate 4 → Gate 7 retrospective → [release-manager] v1.28.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L/XL items
- P-2 ✅ — only one S item (B-101) — well within "S/XS items can run alongside any active item"
- P-3 ✅ — only one M item (B-104), max is two

---

## Completed This Sprint

*(none yet — sprint not kicked off)*

---

## Blockers

*None.*

---

## Out of scope (explicit triage)

The following items were considered for S34 but deferred:

- **B-086** (sidepanel UI/UX design pass, P3/M) — broader umbrella for general visual polish. B-104 + B-101 cover the most pressing pieces; B-086 broader scope deferred to a future sprint.
- **B-100 / B-102 / B-103** (S33 follow-ups) — bug fixes / behavior tweaks; thematically distinct from a visual-polish sprint. Triage at S35 kickoff.
- **B-041** (sync tab order, P2/L) — last big feature item; deserves its own sprint.
- **B-076** (MIGRATION_STEPS hook) — passive future-work placeholder, activates only when a migration step ships.

---

## Pre-flight reminders for kickoff

When the user approves: [scrum-master] launches B-104 R1 [product-manager] (locks Q1-Q6 + ACs) AND B-101 R2 [solution-architect] (R1 already locked) in parallel as a single message. Both items proceed independently through their pipelines per the wave plan above.
