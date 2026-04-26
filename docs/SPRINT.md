# Current Sprint

*Sprint 36 — UI/UX polish bundle. Planned 2026-04-26. **Awaiting product-owner approval to kick off R1.***

Nine-item UI/UX polish-and-bugfix sprint targeting v1.30.0. Bundles 2 carryover follow-ups from S35 (B-107, B-108) + 7 items from product-owner UI review of v1.29.0 (B-109 through B-115). Heavy by item count but only 1 M (the B-110 drift bug); rest are S/XS polish. Ships to `release/v2`. No main merge — manual product-owner task.

**Size flag**: 9 items is the heaviest sprint by count to date (S35 was 5; S34 was 2). 1 M + 4 S + 4 XS is well within P-3 limits (max 2 M parallel; we have only 1). If you'd prefer tighter scope, recommend splitting into S36 (B-110 anchor + B-107 + B-108 + B-112 + B-114 + B-115 = 1M+1S+4XS — bug + tint/chevron tweaks) and S37 (B-109 + B-111 + B-113 = 1XS+2S, the item-row visual polish set).

---

## Gate 6 — Sprint Readiness (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | All sprint items have passed Definition of Ready | ⏳ — all 9 items have user story + priority/effort + dependencies; ACs locked at R1 by [product-manager] |
| 2 | Total sprint effort fits the sprint duration | ⚠️ — 1 M + 4 S + 4 XS = within P-3 limit (1 M of max 2) but heaviest sprint by item count to date. Recommend splitting if user prefers tighter scope. |
| 3 | No unresolved blockers from S35 | ✅ |
| 4 | `SPRINT.md` "Active Items" populated | ✅ (below) |
| 5 | `BACKLOG.md` items filed | ✅ — B-107, B-108 (S35 follow-ups) + B-109, B-110, B-111, B-112, B-113, B-114, B-115 NEW |
| 6 | `BACKLOG_BOARD.md` updated | ✅ |
| 7 | Deps-resolved check | ✅ — all 9 items' deps satisfied (all dependencies are ✅ shipped) |

**Pending product-owner approval before R1 launch.**

---

## Active Items

### [B-110] Drifted-on-non-live BUG fix (anchor)
- **Tier**: Full (M) — full pipeline R1 → R7
- **Wave**: 0 (anchor — investigation-first; touches drift lifecycle in `background/tabs/`)
- **Feature Context**: Drift indicator showing on non-live bookmarks violates §10.7 invariant. User-reported with image evidence post-v1.29.0.
- **Likely fix**: defense-in-depth gate in `_ensureIndicators` (`isDrifted && live`) AND fix the underlying claim-clear leak.
- **Dependencies**: B-099 ✅, B-101 ✅
- **Risk flags**: Could uncover deeper invariant violation. Multi-window UAT may be needed.

### [B-107] Live-X aria-label reactive flip (Fast Track XS, S35 carryover)
- **Tier**: Fast Track (XS) — R1 → R3 → R4 (code + security)
- **Wave**: 0 — touches sidepanel.js item action row aria-label only
- **Feature Context**: WCAG 2.1 SC 4.1.2 — X button on live row currently announces "Delete bookmark" but action is "Close tab" (B-100 v1.29.0).

### [B-108] Solarized-light secondary text AA fix (Full S, S35 carryover)
- **Tier**: Full (S)
- **Wave**: 0 — themes.css solarized-light block only; independent of other items
- **Feature Context**: `--text-secondary` (`#657b83`) on `--bg-secondary` (`#eee8d5`) measures 3.636:1 sub-AA. Affects group counts + helper text.

### [B-112] Remove "Tab Junkie" label from sidepanel header (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — sidepanel.html + sidepanel.css header section; independent of item-row work
- **Feature Context**: Browser already shows extension name in its own chrome; duplicate label wastes vertical space.

### [B-114] Group header tint v2 — brighter, especially on dark themes (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — `shared/themes.css` only (per-theme tint amount overrides)
- **Feature Context**: Product-owner feedback: "very dark in dark modes; want to see it brighter." Per-theme calibration approach recommended (light themes stay at 18%, dark themes bump to 22-25% per WCAG AA ceiling).
- **R1 will lock**: per-theme values across all 14 themes; verify §47.7 WCAG AA spot-check matrix at the new defaults

### [B-115] Group-header chevron brightening (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 0 — `sidepanel/sidepanel.css` `.group-header__chevron` rule (or equivalent)
- **Feature Context**: Product-owner feedback: "items in a group are hard to identify as part of the group; might bring color of group down into items, OR simply start with making the chevron buttons brighter." LOCKED to start with chevron brightening; bring-color-into-items approach deferred to a future B-116 if needed after observing B-114 + B-115 visual impact.
- **R1 PROPOSED**: chevron color → `var(--gc-<slot>)` for group-themed chevron (matches B-104+B-114 tint cohesion); R1 picks vs solid `var(--text-primary)` if group-tinted chevron has contrast issues

### [B-109] Group header text colored to match group color (Fast Track XS)
- **Tier**: Fast Track (XS)
- **Wave**: 1 — sidepanel.css `.group-header .group-name` rule; pure CSS
- **Feature Context**: Group header background is tinted with group color (B-104+B-106+B-114); user wants the text also tinted toward the group color while clearing WCAG AA.
- **R1 proposed**: `color-mix(in srgb, var(--gc-<slot>) 60%, var(--text-primary))` formula

### [B-111] Dynamic delete icon (X for live, trashcan for non-live) (Full S)
- **Tier**: Full (S)
- **Wave**: 1 — sidepanel.js item action row + sidepanel.css icon styling
- **Feature Context**: X button icon should reflect action (close tab vs delete bookmark).
- **LOCKED 2026-04-26**: confirmation dialog scope OUT — keep B-100 v1.29.0 contract verbatim. Item is icon-swap only.
- **Recommended approach**: pure CSS via `[data-live="true"]` attribute selector with two SVG elements

### [B-113] Item-row drag handle on hover + checkbox in multi-select (Full S)
- **Tier**: Full (S) — tier upgraded from Fast Track because drag interaction + multi-select state are tested behavior surfaces with regression risk
- **Wave**: 1 — sidepanel.js item-row construction + drag handle wiring
- **Feature Context**: Current shows non-clickable checkbox border on hover. New: hover shows drag handle (`⋮⋮`); multi-select mode swaps slot to checkbox.

---

## Wave Plan

```
Wave 0 (6 items in parallel — independent surfaces, no JS conflicts)
  ├── B-110 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full M, anchor — drift bug]
  ├── B-107 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.js aria-label]
  ├── B-108 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, themes.css solarized-light]
  ├── B-112 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.html header]
  ├── B-114 R1 → R3 → R4 (Fast Track)              [Fast Track XS, themes.css :root + dark themes]
  └── B-115 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.css chevron]

Wave 1 (3 items — sidepanel item-row visual polish; staged to avoid CSS conflicts)
  ├── B-109 R1 → R3 → R4 (Fast Track)              [Fast Track XS, sidepanel.css .group-header .group-name]
  ├── B-111 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, X-button icon swap]
  └── B-113 R1 → R2 → R3 → R4 → R5 → R6 → R7    [Full S, hover drag handle + multi-select swap]

Sprint Close
  Gate 4 → Gate 7 retrospective → [release-manager] v1.30.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L/XL items
- P-2 ✅ — S/XS items can run alongside any active item
- P-3 ✅ — only one M item (B-110); no second M

**Wave 1 sequencing rationale**: B-109 (text color) lands first to establish the formula; B-111 (X-button icons) second; B-113 (drag handle + checkbox swap) last. All three touch `sidepanel/sidepanel.{js,css}` but in different sections.

---

## Completed This Sprint

*(none yet — sprint not kicked off)*

---

## Blockers

*None.*

---

## Out of scope (explicit triage)

- **B-041** (sync tab order, P2/L) — last big feature item; deserves its own sprint
- **B-076** (MIGRATION_STEPS hook) — passive future-work placeholder
- **B-086** (sidepanel UI/UX umbrella, P3/M) — broader umbrella; could pair with B-041 post-S36
- **Approach 2 from B-115** (bring group color into item rows) — deferred until B-114 + B-115 ship and we observe visual impact; may not be needed

---

## Pre-flight reminders for kickoff

When the user approves: [scrum-master] launches **Wave 0 R1 agents in parallel** (6 R1 simultaneously: B-110, B-107, B-108, B-112, B-114, B-115). After Wave 0 R1 completes, kicks off Wave 1 R1 (3 simultaneously: B-109, B-111, B-113).

Test count baseline: 1,464 (post-S35). Target post-S36: ~1,490+ depending on item-by-item.
