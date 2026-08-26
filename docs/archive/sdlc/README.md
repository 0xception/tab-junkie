# Archived — Multi-Agent SDLC Framework

**Status: retired 2026-08-26. Nothing in this folder is active.**

Tab Junkie was built through Sprint 48 under a simulated software-org process:
a 10-agent roster, a 7-round pipeline, and 7 mandatory quality gates. These are
the instruction files that drove it. They are kept for reference and for the
history they explain — not as rules.

## What's here

| Path | What it was |
|------|-------------|
| `CLAUDE.md` | The project instructions. Agent roster, 7-round pipeline (definition → architecture → build → 3-way review → test/UAT → close → docs), tiers by effort size, Gates 1–7, Definition of Ready/Done, the `[agent-name]` bracket-notation rule, and the R2 correctness checklist C-1 through C-15. |
| `agents/` | The 10 agent definitions: scrum-master, product-manager, solution-architect, frontend-engineer, code-reviewer, security-reviewer, qa-reviewer, test-engineer, technical-writer, release-manager. |
| `commands/` | Slash commands that drove the pipeline: `run-sprint`, `sprint-close`, `doc-audit`. |
| `bootstrap.md` | A generic template for standing the whole framework up on a fresh project. Never Tab Junkie-specific. |

## Why it's archived

The process did its job — it produced a large, well-tested extension with real
architecture documentation. It also produced a lot of ceremony per change. Going
forward the project runs on plain instructions: see `CLAUDE.md` at the repo root.

## What survived into the new CLAUDE.md

The parts that were about *the code* rather than *the process*:

- Extension security rules (untrusted titles/URLs, message validation, strict CSP, no remote code)
- Local-only privacy stance
- The service-worker write boundary and the UI-imports-storage prohibition
- `shared/diag.js` as the only sanctioned diagnostic channel
- `tests/chrome-mock.js` as the only Chrome API stub
- Performance budgets
- Frontend and accessibility standards
- Branching strategy
- The "list all causes before fixing" debugging habit

## Reading the historical record

These documents still describe real decisions and still use the old vocabulary
(B-IDs, rounds, gates, agent brackets):

- `docs/design/` — 80 architecture chapters, indexed by `docs/SOLUTION_DESIGN.md`. Still the best explanation of how the extension works.
- `docs/SPRINT_ARCHIVE.md` — every completed item across 48 sprints.
- `docs/BACKLOG.md` — user stories and acceptance criteria, including open future work (B-198, B-199, B-200).
- `docs/findings/` — per-sprint review findings.
- `docs/UAT_B-*.md` — manual test transcripts.
- `docs/RELEASES.md`, `CHANGELOG.md` — shipped history.

To restore the framework: move these files back to `CLAUDE.md`, `.claude/agents/`,
`.claude/commands/`, and `.claude/bootstrap.md`. Git history has the original
locations.
