---
name: do-it-interface-drill
description: "Problem: API/schema/CLI/protocol changes pass diff review but break consumers because contract compatibility was checked at the wrong boundary or against the wrong version. Fix: walk the producer/consumer boundary — types, schemas, CLI flags, docs, adapters — and catch breakage before merge."
---

# Do-It Interface Drill

## Purpose

Use this to make boundaries explicit before implementation depends on them. A good interface is boring to use, hard to misuse, and easy to verify.

## When To Use

Use when the task:

- adds or changes a public function, API route, event, schema, CLI, config, or UI contract;
- crosses package, process, storage, frontend/backend, or agent boundaries;
- requires a plan that other workers will implement independently;
- defines an agent handoff where a subagent will act as a producer, consumer,
  or reviewer of a slice;
- has repeated defects caused by unclear inputs, outputs, state, or ownership.

For a private helper inside one file, use the light version inline.

## Tier Rules

### Light

Use for one local helper or tiny contract change. Inspect the nearest pattern, write the contract in a test or short note, then implement.

### Standard

Default for subagents and ordinary boundary work. Compare at least two interface shapes before choosing one.

### Heavy

Parent-only unless explicitly assigned. Use for public APIs, schemas, events, UI contracts, migrations, multi-agent handoffs, or cross-package boundaries. Compare multiple radically different shapes and record rejected alternatives.

## Drill Sequence

1. Inspect existing call sites, tests, docs, schemas, and adjacent patterns.
2. Name the consumer, producer, and compatibility owner.
3. Define the job the interface must do, not the implementation it prefers.
4. Generate candidate shapes.
5. Compare candidates for misuse risk, compatibility, testability, migration cost, and future ownership.
6. Choose the smallest shape that safely does the job.
7. Specify inputs, outputs, errors, side effects, lifecycle, and invalid states.
8. Define verification: unit, integration, contract, e2e, visual, or docs checks.

## Review Mode

Use review mode after a diff exists. In review mode, do not generate new
candidate shapes unless the delivered interface is wrong or incomplete. Check
the delivered diff against the chosen contract, compatibility owner, callers,
tests, docs, and invalid states, then return the `do-it-review-loop` schema.

A pre-implementation drill is design evidence. It counts toward a Heavy review
gate only after a read-only reviewer rechecks the delivered diff against the
chosen contract.

## Candidate Shapes

For Standard and Heavy drills, include at least two. For Heavy, make them meaningfully different, not cosmetic renames.

- Function or method API.
- Data object or schema.
- Event or message contract.
- CLI or config surface.
- UI interaction contract.
- Adapter or facade boundary.
- Agent handoff protocol.

Compare with a compact table:

| Shape | Best for | Risk | Verification |
| --- | --- | --- | --- |
| Option A | ... | ... | ... |

## Contract Checklist

- Name: Does it describe the domain action?
- Ownership: Which module owns compatibility and future changes?
- Inputs: What is required, optional, defaulted, or rejected?
- Outputs: What shape is returned and what must callers not infer?
- Errors: How are failures represented and redacted?
- State: What changes, when, and whether it is idempotent?
- Ordering: Are async, retry, replay, or streaming rules explicit?
- Versioning: How do old data, old callers, or old agents continue to work?
- Observability: What logs, events, metrics, or reports prove behavior?
- Tests: What fails if a consumer misuses the contract?

## Agent Handoffs

For subagent-facing interfaces, include:

- tier and ownership;
- allowed and forbidden paths;
- inputs the worker receives;
- output evidence expected from the worker;
- verification the worker must run;
- stop conditions for missing context or blockers.

## Output Shape

Use this shape when handing off or reviewing:

- Interface name and owner.
- Consumers and producers.
- Contract: inputs, outputs, errors, side effects.
- Invariants and invalid states.
- Candidate shapes compared and rejected alternatives.
- Compatibility and migration notes.
- Verification plan.
- Open decisions, if any.

## Review Rules

- Block on ambiguity that can make consumers wrong.
- Block on missing compatibility when old callers or data exist.
- Treat naming or shape cleanup as non-blocking unless misuse risk is real.
- Do not accept a contract that only works because the current implementation has hidden behavior.
- Do not begin parallel implementation until producer and consumer contracts are explicit.

## Common Mistakes

- Designing from the producer's convenience instead of the consumer's job.
- Letting optional fields carry required semantics.
- Comparing only cosmetic variants instead of different interface shapes.
- Hiding lifecycle or retry behavior in implementation details.
- Writing docs without tests for the contract.
- Starting parallel work before producer and consumer agree on the boundary.
