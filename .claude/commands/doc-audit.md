Audit all project documents for consistency using parallel agents.

## Parallel agents (launch all simultaneously)

### Agent 1 — SPRINT & BACKLOG SYNC
- Read SPRINT.md, BACKLOG.md, and BACKLOG_BOARD.md
- Verify all item statuses are in sync across the 3 files
- Check: no completed items showing `backlog` or `in-progress` in BACKLOG.md
- Check: BACKLOG_BOARD.md progress dashboard numbers match actual counts
- Check: no items in SPRINT.md "Active Items" that are already done
- Report all discrepancies

### Agent 2 — SOLUTION_DESIGN & CODE SYNC
- Read SOLUTION_DESIGN.md
- Verify documented API endpoints actually exist in `[YOUR_API_DIR]/`
- Verify documented DB tables match `[YOUR_MIGRATIONS_DIR]/`
- Check for undocumented API routes or tables
- Report all discrepancies

### Agent 3 — PRD & BACKLOG COMPLETENESS
- Read PRD.md and BACKLOG.md
- Check: all PRD features have corresponding backlog items
- Check: no orphan backlog items without PRD backing
- Check: priorities and effort tags are assigned to all items
- Report gaps

## After all agents complete
- Consolidate findings into a single prioritized list
- Propose specific fixes for each discrepancy
- Wait for my approval before making any changes
