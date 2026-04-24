---
name: decision-first-brainstorming
description: Use when the user asks to brainstorm, think through an approach, plan a feature, design behavior, compare options, clarify scope, or handle unclear success criteria before implementation.
---

# Decision-First Brainstorming

## Purpose

Use this as a Codex-native adapter around existing brainstorming and planning skills. It keeps early exploration fast, explicit, and decision-focused before code or docs are changed.

This skill complements, not replaces, `brainstorming` and `writing-plans`. If those skills are available and apply, follow them while using this skill for question quality, role lenses, and decision framing.

## Core Rules

- Explore local truth first. Read relevant files, docs, configs, plans, schemas, or diffs before asking questions that the environment can answer.
- Ask only questions that can change the plan. Do not ask about facts you can discover.
- Ask one important question at a time.
- Separate fact gaps from preference gaps.
- Prefer 2-3 concrete options with a recommendation when the user needs to choose.
- Do not mutate files while intent, scope, or acceptance criteria are still unstable.
- Do not expand scope casually. Name the smallest useful outcome and what is out of scope.

## Task Class First

Classify the work before selecting planning intensity:

- `task`: one bounded deliverable with one acceptance envelope
- `wave`: several related deliverables or a coordinated integration slice
- `phase`: cross-wave boundary, release/gate, workflow architecture, or durable system policy

Treat the class as a planning decision that must be stated explicitly in the
handoff.

## Planning Stack Selection

Default stacks:

- `task`: controller + `plan-challenger`
- `wave`: controller + `plan-challenger` + `architect-reviewer` + `reviewer`
- `phase`: wave stack + one domain/risk reviewer

Domain/risk reviewer selection:

- `red-team-reviewer` for security, persistence, async, retry, replay, or partial-failure risk
- `react-specialist` for React or UI-state-heavy planning
- `typescript-pro` for protocol, type, API, or package-boundary planning
- `sql-pro` for migrations, storage, or query-heavy planning

At minimum, dispatch `plan-challenger` when platform rules and the current user
request permit subagents, and one of these is true:

- The request affects architecture, workflow, data model, security, or release process.
- The user asks for multi-role thinking, enhanced brainstorming, or gstack-like review.
- Success criteria are subjective or hard to test.
- There are multiple plausible implementation paths with different costs.
- The likely plan would create durable maintenance burden.

If `plan-challenger` is unavailable, run the same pass locally.

## Decision Lenses

Use role lenses as checks, not theater:

- Product: what user pain or job is being solved?
- Scope: what is the smallest complete version?
- Engineering: which existing modules and interfaces should carry the work?
- Test: how will success and regressions be proven?
- Failure: what breaks if assumptions are wrong?
- Maintenance: what future review churn or cleanup can be avoided now?

## Output Shape

Before implementation, produce a compact handoff:

- Task class (`task`, `wave`, or `phase`).
- Goal and non-goals.
- Success criteria and acceptance checks.
- Current-state facts discovered locally.
- Open decisions, if any.
- Recommended approach and rejected alternatives.
- Planning stack used and why.
- Recommended implementation mode (`local`, `single-agent TDD`, or `dual-agent TDD`).
- Review stack, including wave/phase minimums when applicable.
- Agent plan, if subagents should be used.

Only move to implementation planning when the handoff is decision-complete enough that another engineer can execute it without guessing.

## Common Mistakes

- Asking the user where a file or type is before searching.
- Treating role lenses as personas instead of evidence checks.
- Proposing broad rewrites when a small path satisfies the goal.
- Continuing to code after finding a product or scope ambiguity.
- Letting an external workflow override project instructions or invariants.
- Producing a plan without naming the task class, implementation mode, and review stack.
