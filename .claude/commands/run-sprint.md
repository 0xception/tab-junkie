Execute Sprint $ARGUMENTS autonomously following the pipeline defined in CLAUDE.md.

## Pre-flight
1. Read SPRINT.md, BACKLOG.md, and BACKLOG_BOARD.md
2. Verify Gate 6 (Sprint Readiness) passes — all items have DoR met
3. List the sprint items and their tiers. Show me the plan and wait for my "proceed" before executing

## Per-item execution
For each sprint item, in priority order:
1. Determine the tier (Fast Track / Full / Spike-First) from the effort tag
2. Run the full pipeline for that tier per CLAUDE.md rules (R1→R8 for Full, R1→R5 for Fast Track)
3. Launch parallel agents where the pipeline allows (R1, R3, R5)
4. After each item completes: run `cd [YOUR_APP_DIR] && [YOUR_TEST_COMMAND]` and `cd [YOUR_APP_DIR] && [YOUR_TYPECHECK_COMMAND]`
5. Only proceed to the next item if ALL checks pass
6. Update SPRINT.md, BACKLOG.md, and BACKLOG_BOARD.md after each item (Gate 5)
7. If any gate fails twice on the same item: STOP and ask me before continuing

## After all items
1. Run Gate 4 verification
2. Write Gate 7 retrospective
3. STOP and show me the results before launching [release-manager]

## Rules
- Use `/usr/bin/git` for all git operations
- Track progress in SPRINT.md after every round
- Never skip R5 reviewers — Gate 1 is non-negotiable
- Respect cross-item parallelization rules (P-1 through P-4)
