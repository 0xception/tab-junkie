# Current Sprint

*No active sprint — Sprint 31 + Sprint 32 closed 2026-04-25 with v1.26.0 (PR #37 merged as `9e21c2e`). Awaiting product-owner direction.*

**v2 ship-readiness state**: v1.26.0 is the candidate "v2 final" — feature-parity closed (S29), settings redesign + themes + polish complete (S31+S32). 9 consecutive sprints shipped without rollback (S23 → S32). Full archive at `docs/SPRINT_ARCHIVE.md`.

**Next step is manual** — product-owner will perform the v2 → main merge as a manual operation (no agent work scheduled).

---

## Backlog status (post-S32)

- **92/98 done (94%)** · 0 in-progress · 3 To-Do · 3 Icebox
- Open To-Do items:
  - **B-041** (P2/L) — Sync tab order action (Chrome tab group sync) — post-feature-parity
  - **B-076** (P2/S) — JSON import MIGRATION_STEPS hook — activates when MIGRATION_STEPS ships first non-empty entry
  - **B-086** (P3/M) — Sidepanel UI/UX design pass — themes-aware; could pair with future polish work
- Icebox: B-034 (absorbed into B-014), B-039 (dropped, MV3 constraint), B-056 (replaced by B-061)

---

## v2 → main merge — manual checklist (for product-owner reference)

When you decide to do the v2 → main merge, here's a suggested sequence:

1. **Pre-merge audit** (optional but recommended): run the full test suite + `./build.sh` + smoke-test each surface (sidepanel, newtab, standalone, settings, popup, group-jump-popup) on a fresh extension reload.
2. **Comprehensive UAT sweep** (optional): the ~280+ deferred UAT cases since S17 have never been formally executed end-to-end. If you want a clean v2 ship, run the cumulative sweep before the main merge.
3. **Branch cleanup**: confirm `release/v2` is clean (`git log release/v2..main` — should be empty if main hasn't moved).
4. **Merge approach**: 
   - Option A: open PR `release/v2` → `main` and merge
   - Option B: cherry-pick or fast-forward
   - Option C: replace main with v2 (force-push — destructive; only with explicit backup)
5. **Tag**: tag `v2.0.0` on main after merge (or keep semver continuity with `v1.26.0` already tagged on release/v2)
6. **Post-merge**: update README pointing to v2 features; archive any v1-specific docs

---

## Carry-forward from Sprint 31+32

### Tech debt (deferred to future sprints OR rolled into B-088 future bundles)

- **`group-jump-popup` broadcast subscription** (B-088 R4 LOW) — popup is short-lived; cache invalidation not currently needed. Document for future "persistent popup" feature.
- **Comprehensive UAT sweep** (~280+ deferred cases since S17) — strong candidate before main merge.
- **B-086 UI/UX polish pass** — now that themes are shipped, this could pair with B-041 sync work or stand alone.

### From S31 retro

- ✅ B-088 (S30 carry-forward bundle) — closed S32
- ✅ B-096 (S31 security MEDIUM) — closed S32
- ✅ B-097 (S30 LOW deferred) — closed S32

### From S32 retro

- All action items closed in same sprint via slip-in (B-098 Tokyo Night).
- No new outstanding action items for S33.

---

## Blockers

*None.*
