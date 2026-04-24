---
name: quality-workflow-router
description: Use when the user asks for coding, bug fixing, refactoring, review, planning, brainstorming, implementation, quality improvements, agent use, or high-quality workflow without naming a specific skill.
---

# Quality Workflow Router

## Purpose

Use this as the automatic entry point for quality-biased Codex work. It routes ordinary user requests to the right workflow so the user does not need to name skills manually.

This skill is intentionally short. It should trigger, choose the workflow, then defer to the more specific skill.

## Route By Intent

- Ambiguous idea, feature shape, behavior design, unclear success criteria, or tradeoff discussion: use `decision-first-brainstorming`.
- Implementation, bugfix, refactor, test addition, or behavior change: use `agentic-tdd-execution`.
- Review, PR/diff inspection, quality audit, redundancy search, or risky-change assessment: use `multi-perspective-review`.
- Unexpected failure or unclear root cause during work: use existing systematic debugging guidance if available, then return to `agentic-tdd-execution`.
- Completion claim, handoff, merge, or ship readiness: use existing verification/completion guidance if available, then use `multi-perspective-review` when the diff is non-trivial.

## Default Quality Policy

- Classify the work as `task`, `wave`, or `phase` before selecting intensity.
- Obey local repository instructions over this generic workflow, especially
  commit message/body rules, branch policy, command wrappers, and required
  verification commands.
- For planning, increase stack depth with task size instead of using one fixed reviewer set everywhere.
- For non-trivial implementation, start with a modification map before production edits.
- For behavior changes, use TDD unless explicitly scoped out.
- For ordinary non-trivial behavior changes, default to single-agent TDD.
- For higher-risk multi-file behavior changes, route to selective dual-agent TDD.
- For non-trivial diffs, include code-quality/redundancy review.
- For `wave` work, require at least two reviewers.
- For `phase` work, default to a four-reviewer stack.
- For risky diffs, include adversarial review.
- For tiny mechanical edits, keep the flow local and fast.

## Subagent Policy

When platform rules and the user's request permit subagents:

- Treat agent routing as an explicit decision, not an optional afterthought.
  State the chosen agent set and why before edits.
- Use `code-mapper` before non-trivial code edits unless fresh local reads
  already prove the owning path and risks.
- Prefer `plan-challenger` for non-trivial planning and `architect-reviewer` once the work reaches `wave` scale.
- Prefer `tdd-red-writer` when the task is high-risk enough that RED and GREEN should be split.
- Use `code-quality-cleaner` before finalizing non-trivial diffs.
- Add specialists only when their domain is touched.
- Do not spawn agents for work that is tightly coupled to the immediate next local step.
- Do not ask implementation subagents to commit by default. The controller owns
  final commit shape unless the task explicitly delegates commit creation with
  the repository's exact commit rules.

## Token Budget Policy

- Tiny mechanical edits: no subagents, local review only.
- Bounded non-trivial edits: one mapper or one specialist plus local TDD, then
  the smallest useful review stack.
- Multi-package, stateful, contract, UI-state, storage, or unclear-root-cause
  work: use mapper first and add only the domain agents that match touched risk.
- Wave/phase work: spend tokens on early mapping and review; avoid passing full
  session history to agents. Give each agent the exact diff, task text, file
  paths, and questions it must answer.
- If an agent result would block the immediate next step, do that blocking
  investigation locally instead of spawning and waiting.

If subagents are unavailable or not permitted, perform the same lens locally and say so only when it affects confidence.

## Common Mistakes

- Asking the user to name the workflow when intent is already clear.
- Triggering the full review stack for a one-line mechanical change.
- Starting implementation before resolving a product or scope ambiguity.
- Skipping the quality review because tests passed.
- Treating every non-trivial task as if it needed the same planning, TDD, and review depth.
