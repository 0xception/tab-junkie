Close the current sprint using parallel agents for maximum efficiency.

## Pre-check
1. Read SPRINT.md and verify all items are marked "done"
2. If any items are NOT done, list them and STOP — do not proceed with partial closure

## Parallel agents (launch all 3 simultaneously)

### Agent 1 — CODE REVIEW
- Review all files changed this sprint (from SPRINT.md "Files Changed" lists)
- Check for: type safety, error handling, security issues, N+1 queries, missing pagination
- Report findings as a structured list with file:line references
- Do NOT modify any files

### Agent 2 — DOCS UPDATE
- Verify and update SPRINT.md — all items in "Completed This Sprint" with files changed
- Verify and update BACKLOG.md — all completed items set to `done`
- Verify and update BACKLOG_BOARD.md — all completed items marked ✅, progress dashboard accurate
- Verify SOLUTION_DESIGN.md was updated for all items (R7 close)
- Report any discrepancies found

### Agent 3 — RELEASE PREP
- Run `cd [YOUR_APP_DIR] && [YOUR_TEST_COMMAND]` to verify all tests pass
- Run `cd [YOUR_APP_DIR] && [YOUR_TYPECHECK_COMMAND]` to verify types
- Compile release notes from SPRINT.md completed items
- Determine semantic version bump (patch/minor/major)
- Prepare the release notes in GitHub Release format
- Do NOT create tags, PRs, or releases yet

## After all 3 agents complete
1. Synthesize results — flag any blockers from Agent 1 or Agent 3
2. Run Gate 4 verification checklist
3. Write Gate 7 retrospective in SPRINT.md
4. Show me everything and wait for approval before:
   - Launching [release-manager]
   - Creating PR to main
   - Archiving to SPRINT_ARCHIVE.md

## Rules
- Use `/usr/bin/git` for all git operations
- Do NOT merge, push, or tag without my explicit approval
