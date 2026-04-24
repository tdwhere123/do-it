---
name: agentic-tdd-execution
description: Use when the user asks to implement, build, fix a bug, refactor, change behavior, add tests, improve code, or make a non-trivial code change with high quality.
---

# Agentic TDD Execution

## Purpose

Use this for everyday high-quality implementation. It bridges existing `test-driven-development`, `subagent-driven-development`, and Codex subagents without making every small edit a heavyweight ceremony.

`subagent-driven-development` remains the heavy path for a written plan with mostly independent tasks. This skill is the default path for one implementation task or a small batch.

## Execution Modes

Choose one mode explicitly before editing:

- **Mode A: local/mechanical** for tiny, low-risk edits
- **Mode B: single-agent TDD** for ordinary non-trivial work
- **Mode C: dual-agent TDD** when RED and GREEN should be split across agents

If the task came from a planning handoff, follow the mode chosen there unless
new local evidence makes that unsafe.

Before editing, also state:

- task class: `task`, `wave`, or `phase`
- whether subagents are permitted in this turn
- mapper/specialist/reviewer routing chosen for quality and token budget
- the repository's commit rule if a commit may be created

## Quality-Biased Default

For non-trivial code changes, default to:

1. Read local constraints and relevant docs.
2. Dispatch `code-mapper` or perform a modification map before coding; when
   subagents are permitted, use `code-mapper` unless fresh local reads already
   prove the owning path and risks.
3. Choose `single-agent TDD` or `dual-agent TDD`.
4. Write or update the smallest failing test.
5. Verify RED for the expected reason.
6. Implement the minimal GREEN change.
7. Verify GREEN.
8. Refactor only after green.
9. Run targeted verification, then broader verification when risk justifies it.
10. Request quality and correctness review before claiming completion.

If a step is skipped, state why.

## When To Split RED And GREEN

Use **dual-agent TDD** when one or more are true:

- the behavior change crosses multiple files or boundaries
- bug root cause is unclear
- protocol, API, state, persistence, or UI-state contracts are changing
- regression risk is high enough that tests should define the contract first
- test harness or fixture work is substantial on its own

Default back down to **single-agent TDD** when the change is bounded enough that
splitting RED and GREEN would mostly add coordination cost.

## TDD Routing

For `single-agent TDD`:

- the implementer owns RED, GREEN, and the narrow refactor

For `dual-agent TDD`:

- `tdd-red-writer` owns RED only
- the controller verifies RED for the expected reason
- the implementer owns GREEN only
- the controller verifies GREEN before review

If `tdd-red-writer` is unavailable, use `test-automator` for the RED pass or do
the RED step locally.

## Modification Map First

Use `code-mapper` when platform rules and the current user request permit subagents. If not, perform the map locally.

Do not treat "the controller can map it locally" as the default escape hatch.
For any non-trivial change where agents are permitted, skipping `code-mapper`
requires a short reason such as "single-file mechanical edit" or "owning path
just read and unambiguous."

The map must include:

- owning files and symbols;
- relevant call path or data flow;
- package, API, storage, UI, or async boundaries;
- tests that should fail first;
- risky branch points and failure modes;
- unknowns and fastest checks to resolve them.

Do not start production edits until the map is good enough to avoid guessing.

## TDD Gate

Follow the existing TDD authority if available.

For features, bugfixes, refactors, and behavior changes:

- RED: add or update a test for one behavior.
- Verify RED: run the narrow command and confirm the failure proves the missing behavior.
- GREEN: implement the smallest change that passes.
- Verify GREEN: rerun the narrow test.
- Refactor: clean while keeping tests green.

Tests-after is allowed only for explicitly scoped exceptions such as generated code, pure config, or throwaway prototypes.

## Agent Routing

Use the smallest useful agent set:

- Unknown ownership or call path: `code-mapper`.
- RED-only test authoring for a high-risk behavior contract: `tdd-red-writer`.
- Test strategy, fixture risk, or test harness work: `test-automator`.
- TypeScript API, type boundary, or package contract: `typescript-pro`.
- React state, rendering, hooks, or UI behavior: `react-specialist`.
- SQL, migrations, storage, or query design: `sql-pro`.
- Architecture boundaries or long-term coupling: `architect-reviewer`.
- Disjoint implementation slice: `worker`, with explicit write ownership.

Do not dispatch implementation workers in parallel unless write scopes are disjoint. Tell workers they are not alone in the codebase and must not revert others' edits.

Commit ownership:

- Implementation subagents should not commit by default.
- The controller should commit after verifying tests, reviews, and repository
  commit-message/body rules.
- If a subagent must commit, the controller must include the exact repository
  commit format and verification requirements in the prompt.

## Non-Trivial Change Threshold

Treat a change as non-trivial if it:

- touches more than one file;
- changes behavior, data flow, schema, API, runtime state, tests, or UI state;
- adds or removes an abstraction;
- fixes a bug with unclear root cause;
- can affect persistence, security, concurrency, or user-visible behavior.

Non-trivial changes should get `code-quality-cleaner` during review when available.

Token-saving defaults:

- Do not spawn both a generic reviewer and a specialist for the same lens.
- Prefer one high-signal specialist over multiple overlapping reviewers.
- Use `tdd-red-writer` only when RED/GREEN separation materially reduces risk.
- For docs-only or config-only edits, prefer local verification plus
  `spec-compliance-reviewer` only when acceptance drift is plausible.

## Coordinator Duties

The main agent remains responsible for integration:

- Review subagent findings before acting on them.
- Resolve conflicts between agents.
- Keep edits within user and repo scope.
- Protect user changes in the worktree.
- Verify RED before handing off GREEN in dual-agent mode.
- Verify GREEN before claiming completion.
- Verify the chosen review stack matches the task class.

## Common Mistakes

- Dispatching a worker before mapping the affected path.
- Letting a subagent choose scope that the user did not approve.
- Treating a mapper report as permission to skip TDD.
- Running broad review before verifying the narrow RED/GREEN loop.
- Parallelizing tightly coupled edits that will conflict.
- Splitting RED and GREEN on low-risk work where one agent could finish safely.
- Letting the RED writer edit production code.
