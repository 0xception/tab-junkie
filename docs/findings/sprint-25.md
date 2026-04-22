# Sprint 25 — R4 Findings (Deduplicated)

Fast Track sprint — per-item findings from [code-reviewer] + [security-reviewer]. [qa-reviewer] skipped per tier rule.

---

## B-083 — Allow multiple sibling sub-groups under one parent

### CRITICAL / HIGH / MEDIUM
_None._

### LOW

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-083-L1 | `tests/b007-sub-group-nesting.test.js` | Renamed test orphans old `AC8` label; second `AC11` entry exists further down (`AC11c`). No collision, no correctness issue — the `c` suffix distinguishes them. | Optional future tidy. | code-reviewer |
| B-083-L2 | `tests/b031-group-drag.test.js` (near the second T-10 test) | `outIds` intermediate variable is now used for only one surviving guard assertion after B-083's filter removal pruned the companion guard. Dead-variable per project's no-dead-code standard. | Inline: `assert.equal(out.map(g => g.id).includes('g-sub'), false, 'self still excluded')`. Drop the `outIds` binding. | code-reviewer |

### Security Review

**Clean**. SEC-1 through SEC-5 all PASS. Depth-2 escape surface analysis:
- `bulkReorderGroups:343-348` + `updateGroup:205-210` both enforce the "source-has-children" guard at the storage layer. B-083 removes the UI pre-filter but the storage layer remains fail-closed.
- `assertDepthAndCycle:56-86` walks ancestor chains and rejects circular via `ERR_CIRCULAR_REF`.
- `writeTransaction` is atomic — no partial depth-2 state can land.

**Recommendation**: PROCEED to UAT.

---

## B-084 — Refine drag drop-zone visual differentiation (REORDER vs NEST)

### CRITICAL / HIGH
_None._

### MEDIUM

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-084-M1 | `sidepanel/sidepanel.js:5525` (hysteresis NEST-leaving branch) | Theoretical boundary sign-flip risk on headers < 8 px tall — `DEADZONE_PX = Math.min(2, headerHeight * 0.25)` clamping compresses boundary positions below 2 px. Does not occur in practice (current UI headers are 32 px+). | Defer — add to S26+ hygiene pass if headers ever shrink. | code-reviewer |
| B-084-M2 | `sidepanel/sidepanel.js:5600` (`_computeGroupDropTarget`) | Side-effect write to `_groupDragState.pendingProposedMode` inside a function named `_compute*` breaks implicit purity convention. Hygiene / cohesion concern, not correctness. | Move the write to the caller (`_groupDragTick`). Non-urgent. | code-reviewer |

### LOW

| # | File | Finding | Fix | Flagged by |
|---|------|---------|-----|------------|
| B-084-L1 | `sidepanel/sidepanel.css` (two `@supports` blocks) | Two separate `@supports not (...)` expressions guard the same `color-mix` capability via different property expressions. Low risk in practice; could diverge on future engines. | Single shared `color-mix` capability block. Non-urgent. | code-reviewer |
| B-084-L2 | `sidepanel/sidepanel.js` (`_applyGroupDragHysteresis`) | `DEADZONE_PX = 2` tunable lives inside the helper, not at module scope. Checklist B-6 asks for a named constant. | Extract to module-level `const GROUP_DRAG_DEADZONE_PX = 2`. | code-reviewer |

### Security Review

**Clean**. SEC-1 through SEC-5 all PASS.
- Hysteresis math terminates — `prevMode === rawMode` short-circuits; symmetric deadzone prevents strobing.
- `pendingProposedMode` correctly cleared on no-target tick + target-change + dragend.
- No new rAF, no new event listeners, no new DOM writes.
- Zero new `getBoundingClientRect` calls in hot path.

**Recommendation**: PROCEED to visual UAT.

---

## B-085 — Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist

### CRITICAL / HIGH / MEDIUM / LOW
_None._

### Code Review

**Clean**. All AC checks PASS:
- A-1 C-10 row text verbatim matches AC1 spec.
- A-2 `git diff --stat CLAUDE.md` = 1 insertion, 0 deletions.
- A-5 C-1 through C-9 unchanged; no other CLAUDE.md drift.
- Markdown table renders cleanly; backticks + pipes parse correctly.

Security review skipped per [scrum-master] discretion — documentation-only edit with no code surface.

**Recommendation**: PROCEED to close.
