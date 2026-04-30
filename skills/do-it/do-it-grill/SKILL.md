---
name: do-it-grill
description: "Problem: you think you heard the requirement but you only heard the surface; hidden assumptions, unstated constraints, and contradictions with project invariants ship as bugs and rework. Fix: list the 5 premises most likely wrong, surface conflicts with current truth, pin down ambiguous terms, and predict failure modes by category — before any plan or code."
---

# Do-It Grill

## Purpose

Use this to pressure-test reasoning before work hardens into code, docs, commits, or claims. The goal is to expose weak assumptions, missing truth checks, vague acceptance criteria, and hidden delivery risk early.

`do-it-review-loop` owns delivered diff review, QA intake, and multi-perspective
findings. `do-it-grill` challenges whether that review is needed, sufficient,
or honestly closed.

## When To Use

Use the grill when:

- the user asks to be grilled, challenged, or stress-tested;
- a plan has multiple plausible paths;
- acceptance criteria are vague;
- architecture, interface, release, phase, wave, or multi-agent coordination is involved;
- a review response seems too agreeable or under-evidenced;
- a closeout claim may outrun verification.

Skip the grill for tiny mechanical edits with obvious acceptance checks.

## Tier Rules

### Light

Use for bounded work:

- inspect the nearest truth;
- name 2-5 assumptions or risks;
- ask at most one question if a preference is needed;
- recommend the next route.

### Standard

Default for subagents and ordinary non-trivial planning:

- inspect code/docs/tests before asking;
- build a short decision tree;
- challenge goal, non-goals, acceptance, sequencing, and verification;
- return blockers, important risks, options, and a recommendation.

### Heavy

Parent-only unless explicitly assigned:

- wave, phase, architecture, interface, release, or multi-agent decisions;
- codebase exploration is mandatory;
- include scope lock, verified facts, decision options, gates, and residual risk.

## Decision Tree Interview

Use this instead of a list of generic questions:

1. If a question is answerable by reading files or running a safe command, inspect instead of asking.
2. If repository truth contradicts the premise, show the evidence and reroute.
3. If the gap is a human preference, priority, or risk appetite, ask one concrete question with a recommended option.
4. If a risk can be resolved with a cheap check, run or propose that check before asking.
5. If there are multiple viable paths, compare 2-3 options and pick one.
6. If no user input is needed, state the assumption and continue.

## Lenses

Use these as checks, not personas:

- Truth: What has been verified locally, and what is only assumed?
- Scope: What is the smallest complete outcome?
- Acceptance: What exact evidence proves the work is done?
- Interface: Which contract or boundary will another part of the system rely on?
- Failure: What is the most likely way this plan ships a bug?
- Review: What would a skeptical reviewer block on?
- Maintenance: What future churn can be avoided without expanding scope?
- Delegation: Does each worker have a tier, ownership, verification, and stop conditions?

## Codebase Exploration

For Standard and Heavy grills, inspect enough current truth to avoid theater:

- current diff and dirty files in scope;
- owning modules, call paths, tests, docs, or plans;
- existing terminology and conventions;
- nearby working examples;
- verification commands or evidence surfaces.

Stop exploration when the next unknown is a real user decision or the facts are sufficient to recommend a route.

## Output Shape

For a light grill:

- current truth checked;
- assumptions;
- 2-5 sharp questions or risks;
- recommended route.

For a standard grill:

- current truth checked;
- decision tree with the next controlling decision;
- blockers;
- important risks;
- options considered;
- recommended path;
- verification and review checks.

For a heavy grill:

- scope lock;
- verified facts;
- blockers;
- important risks;
- non-blocking opportunities;
- decision options with one recommended path;
- verification and review gates that must be satisfied.

## Severity

- `Blocking`: Must resolve before execution or closeout because it can make the work wrong, unsafe, or unverifiable.
- `Important`: Should resolve now because it can create rework, review failure, or unclear ownership.
- `Opportunity`: Useful architecture or quality improvement, but not a blocker unless tied to correctness or delivery risk.

## Common Mistakes

- Challenging in the abstract without reading files.
- Turning every idea into a blocker.
- Asking many questions when one decision controls the next step.
- Asking about facts that codebase exploration can answer.
- Accepting a plan because it sounds reasonable while evidence is missing.
- Treating architecture taste as delivery truth.
