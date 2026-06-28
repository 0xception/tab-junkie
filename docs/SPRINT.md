# Current Sprint — between sprints (Sprint 46 CLOSED 2026-06-27)

**Sprint 46 is closed.** Full item detail, velocity, Gate 7 retrospective, and final state are in
`docs/SPRINT_ARCHIVE.md` (## Sprint 46 — Durable claim identity).

**Release:** v1.41.0 tagged on `release/v2` (`gh release create` skipped per established pattern).
**Tests:** 2099 / 2099 PASS · zero regressions. **Schema:** v7 → v8 (new `tj:itemClaims` partition, additive).

---

## Completed This Sprint (Sprint 46)

| Item | Name | Tier | Status |
|------|------|------|--------|
| B-167 | Durable claim identity (anchor) | Full Spike-First (XL) | ✅ DONE · UAT WAIVED (product-owner) |
| B-168 | Jump to active window | Full (S) | ✅ DONE · UAT WAIVED (product-owner) |
| B-169 | Ways-of-working: human names in discussion | Fast Track (XS) | ✅ DONE |
| B-170 | R4 contract-vs-implementation diff gate | Fast Track (XS) | ✅ DONE |
| B-171 | Reusable diagnostic-trace helper | Fast Track (XS) | ✅ DONE |

**Carried debt into Sprint 47:** B-167 + B-168 UAT (waived at close — durable-identity reload/restart
and jump-to-window scroll are real-browser behaviors `chrome-mock` cannot fully reproduce).

---

## Next Sprint — Sprint 47 (opening)

**Anchor:** B-173 — single-source-of-truth tab↔item identity consolidation (XL Spike-First). Direct
output of the 2026-06-27 architectural review: collapse `tj:tabClaims` (session) + `tj:itemClaims`
(durable) + `floatingGroups.liveTabId` into one authoritative identity store, with low-risk refactors
(shared resolver, split `floating-groups.js`, named event fan-out, decomposed `reconcileClaims`)
sequenced as safe early steps. Begins with a [solution-architect] R0 discovery spike.
