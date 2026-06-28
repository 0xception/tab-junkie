# Current Sprint — Sprint 47

**Theme:** Single-source-of-truth tab↔item identity consolidation (EPIC) — collapse the six stores that hold bookmark↔tab identity into one authoritative store. Direct follow-through on B-167 §73.11, which earmarked this exact consolidation as a "Sprint 48 revisit"; the 2026-06-27 architectural review pulled it forward.
**Branch:** `feature/sprint-47-identity-consolidation` (off `release/v2` at v1.41.0 / `4355b2a`)
**Opened:** 2026-06-27
**Estimated effort:** 1 × XL epic (B-173) decomposed into 7 sub-items (B-174..B-180), two of them L-tier.

---

## Sprint 47 Charter

R0 spike complete (`docs/design/74-b-173-r0-spike.md`). Product-owner approved the **whole program as one EPIC in Sprint 47** with record model deferred to a B1 design-confirm spike.

**⚠️ P-1 override (Scope Change Control):** CLAUDE.md P-1 caps one L/XL item active at a time; this sprint runs the full epic including two L-tier items (B-175 resolver, B-179 store cutover) and a schema migration (B-180). The product-owner explicitly authorized this on 2026-06-27. Risk acknowledged: the B-179 storage cutover is irreversible and verifiable only via real-browser UAT (session-wipe-on-reload vs SW-restart is not modeled by chrome-mock). Mitigations: (1) execute strictly in dependency order behind the B-174 test net; (2) gate B-179 on the B1 design-confirm spike; (3) keep `floatingGroups` recovery tiers until a sprint of clean signal before B-180 deletes them.

---

## Execution sequence (dependency order)

```
B-174  E2E cold-start reconciliation test (SAFETY NET)        ← start here
  └─ B-175  Extract ONE shared tab↔item resolver
       ├─ B1 design-confirm spike (record model: Option A vs B)
       ├─ B-176  Split floating-groups.js → ~4 modules     ┐ parallelizable
       ├─ B-177  Name onReplaced/onRemoved fan-out          │ after B-175
       ├─ B-178  Decompose reconcileClaims → named phases   ┘
       └─ B-179  Collapse to one store; retire session; demote liveTabId  (needs B-178 + B1 spike)
            └─ B-180  Eager floatingGroups v4-only migration + schema v8→v9
```

---

## Gate 6 — Sprint Readiness (verified 2026-06-27)

- ✅ Epic B-173 R0 spike complete; 7 sub-items B-174..B-180 filed (`in-progress`, sprint 47).
- ✅ Tier declared per sub-item (5 × M/L no-behavior-change refactors + B-179/B-180 behavior-changing).
- ⚠️ P-1 override recorded above (product-owner authorized).
- ✅ **Deps-resolved check** — B-174 dep B-167 ✅; all other sub-item deps are in-sprint (B-174→B-175→…).
- ⚠️ **Carried debt:** waived B-167 + B-168 UAT folded into the B-173 real-browser probe plan (§74.11 P-1/P-2/P-7).

---

## Active Items

### [B-173] Single-source-of-truth tab↔item identity consolidation (EPIC anchor)

- **Tier**: Spike-First (XL) · **Priority**: P2 · **Status**: R0 ✅ COMPLETE → executing sub-items
- **Target (from §74)**: durable `tj:itemClaims` = sole authority; retire session `tj:tabClaims`; demote `floatingGroups.liveTabId` to derived cache; collapse 10 match sites into ONE recovery resolver; keep `LiveTabIndex` as the live oracle. Net code deleted, not added.
- **Schema impact**: one bump total, v8→v9 eager, at B-180.

| Sub-item | Name | Tier | Behavior change? | Status |
|----------|------|------|------------------|--------|
| **B-174** | Cold-start reconciliation E2E test (safety net) | M | No | **R3 IN PROGRESS** ([test-engineer]) |
| B-175 | Extract one shared tab↔item resolver | L | No | queued (after B-174) |
| B-176 | Split `floating-groups.js` → ~4 modules | M | No | queued (after B-175) |
| B-177 | Name `onReplaced`/`onRemoved` fan-out primitives | M | No | queued (after B-175) |
| B-178 | Decompose `reconcileClaims` → named phases | M | No | queued (after B-175) |
| B-179 | Collapse to one store; retire session; demote liveTabId | L | **Yes** | queued (after B-178 + B1 spike) |
| B-180 | Eager `floatingGroups` v4-only + schema v8→v9 | L | **Yes** | queued (after B-179) |

- **Open question deferred to build:** record model (Option A two-record-kinds vs Option B unified) — a B1 design-confirm spike decides before B-179 build (product-owner: "let the B1 spike decide").

---

## Completed This Sprint

_None yet — B-174 (safety-net test) in progress._
