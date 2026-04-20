# § 35. B-007 — Sub-group Nesting (depth = 1)

**Sprint**: 20 · **Merged**: TBD on `release/v2` · **Tier**: Full (M)

## 35.1 Scope

B-007 wires the user-facing affordances for one-level group nesting. The
storage authority (`background/storage/groups.js`) already enforces the
depth-1 cap, cycle rejection, and delete-parent-cascade behaviour — all of
that has been in place since **B-001a AC4** and **B-006**. B-007's
contribution is UI-only: dialog affordance, indented rendering, friendly
error translation.

Drag-to-nest is **out of scope** — it belongs to **B-031** (group drag-reorder
& nesting via drag), which remains in the backlog.

## 35.2 R2 Correctness Checklist (Sprint 20 Wave 0 — first invocation with C-6/C-7 live)

| # | Check | Result |
|---|-------|--------|
| C-1 | Storage schema versioned | N/A — `parentId` already persisted by B-001a |
| C-2 | Message contracts typed | N/A — `MSG_CREATE_GROUP` / `MSG_UPDATE_GROUP` already carry `parentId` |
| C-3 | SW cold-start safe | ✅ No new SW-memory state; all UI reads hydrate from `_cachedGroups` |
| C-4 | ID stability | ✅ Nesting is a `parentId` edit — no ID changes |
| C-5 | Manifest file refs | ✅ No manifest change |
| C-6 | Permission minimization | ✅ Zero new permissions |
| C-7 | Allow-list direction | N/A — no new sanitizer / validator / export surface |
| C-8 | SW-context feasibility | N/A — all work is sidepanel DOM-side |
| C-9 | Empty-state design | ✅ Enumerated in AC11: (a) zero top-level groups, (b) zero candidates after self-exclusion, (c) parent deleted elsewhere mid-dialog → `ERR_NOT_FOUND` path |

## 35.3 UI architecture

### 35.3.1 Parent picker in `#group-dialog`

`<select id="group-field-parent">` inserted between the Color radiogroup
and the dialog-level error row. First option is always `value=""` →
"Top-level (no parent)". Remaining options are the output of
`filterGroupParentCandidates(_cachedGroups, editingGroup)`, sorted by
`sortOrder` ascending.

### 35.3.2 `shared/group-nesting.js`

Pure, DOM-free module (matches the B-065 `shared/aria-label.js` +
`shared/group-picker-core.js` precedent). Exports:

- `filterGroupParentCandidates(groups, editingGroup)` — excludes already-nested
  groups (depth-1 cap), the group being edited (self-nest defence), and
  groups that already have at least one child (depth-2 prevention).
- `translateGroupError(code)` — maps `ERR_DEPTH_EXCEEDED` / `ERR_CIRCULAR_REF`
  / `ERR_NOT_FOUND` to inline-friendly strings; returns `null` for
  codes it does not own so callers fall back to `err.message`.

### 35.3.3 CSS

New token `--group-indent: 20px` scoped to `.group-section`. The
`.group-section--child` selector (pre-existing from the rendering
infrastructure) now applies `padding-left: var(--group-indent)` rather
than a hard-coded 20px. Theme-neutral — same value in light and dark.

## 35.4 Empty-state enumeration (C-9 compliance)

| State | Input | Expected UI |
|-------|-------|-------------|
| **Zero top-level** (create) | `_cachedGroups` has only nested groups | Parent select shows only "Top-level (no parent)" |
| **Zero candidates after self + children-of exclusion** (edit) | Every other group either has children or is nested | Same — Top-level only |
| **Parent deleted elsewhere mid-dialog** | User submits edit with a parentId that no longer exists | Backend rejects `ERR_NOT_FOUND`; dialog shows "Selected parent group no longer exists. Close this dialog and try again." |

## 35.5 Rollback plan

No storage schema change — rollback is pure `git revert` of the B-007
commit. The reverted state is identical to the pre-B-007 UI (dialog
always creates top-level groups; rendering path still honours `parentId`
because that read path predates B-007).

## 35.6 Decisions / deviations from R2 plan

| # | Decision | Rationale |
|---|----------|-----------|
| D-1 | Put pure helpers in `shared/group-nesting.js` rather than inline in `sidepanel.js` | Matches B-065 extraction precedent; tests import the helpers directly, avoiding the drift-risk of re-implementing the filter logic in the test file. |
| D-2 | Drag-to-nest explicitly deferred to B-031 | Keeps B-007 Fast-Track-M shaped; UI-only scope. B-031 will add the drag path later. |
| D-3 | `--group-indent` is a `.group-section`-scoped CSS variable, not a global token | Keeps the token co-located with the only surface that uses it; avoids polluting the global :root palette until a second consumer materialises. |

## 35.7 Accessibility

- `<label for="group-field-parent">` announces "Parent group" to screen readers.
- Tab order: Name → Color swatches → Parent select → Cancel → Save.
- Escape closes the dialog (existing shared handler).
- Inline error (`#group-error-dialog`) uses `aria-live="assertive"` so the
  translated message surfaces when the backend rejects a submit.

## 35.8 Sprint 20 — Verification summary

- **Tests**: 955 → 968 green (+13 B-007 tests in `tests/b007-sub-group-nesting.test.js`)
- **Build**: `./build.sh` clean (598 K zip, 66 files — `shared/group-nesting.js` added)
- **UAT**: plan at `docs/UAT_B-007.md`, **DEFERRED** per Sprint 20 pattern (UAT burndown track)
