---
name: do-it-interface-drill
description: "Use when API, schema, CLI, or protocol changes must be checked across producer and consumer contract boundaries before merge."
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

## Contract Principles

- Contract-first: callers should be able to use the boundary from the written
  contract, not from reading implementation internals.
- Hyrum's Law: if consumers can observe behavior, some consumer may rely on it;
  preserve it or explicitly migrate it.
- Consistent error semantics: the same failure class should be represented,
  redacted, logged, and retried consistently across producer and consumer.
- Validate at boundaries: reject invalid input where it enters the system, not
  after downstream code has inferred meaning from it.
- Prefer additive change when old callers, old data, or old agents may exist.
  Breaking change needs a compatibility owner, migration path, and verification.

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

## Stop Conditions

Stop before implementation or parallel dispatch when:

- producer and consumer disagree on required fields, error semantics, or
  lifecycle;
- a breaking change has no migration path or compatibility owner;
- validation is left to an internal implementation detail;
- consumers must infer hidden behavior not named in the contract;
- verification cannot prove both producer and consumer expectations.

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
- Treating an undocumented observed behavior as safe to remove.
- Mixing multiple error formats for one boundary because each caller already
  handles its own path.

## Common Rationalizations

- *"This is internal, so compatibility does not matter."* — Internal consumers
  still form contracts when multiple modules, agents, or generated surfaces rely
  on behavior.
- *"Old callers probably do not use that field."* — If it is observable, prove
  it is unused or make the change additive.
- *"Validation can happen downstream."* — Downstream validation means invalid
  state already crossed the boundary.

## Red Flags

- The contract only describes the happy path.
- Optional fields are required in practice.
- Errors differ by caller instead of failure class.
- Tests exercise producer internals but no consumer-visible contract.
- A docs-only interface change has no matching source or generated-surface
  check.

## Verification

An interface drill is ready when:

- producer, consumer, and compatibility owner are named;
- inputs, outputs, error semantics, side effects, lifecycle, invalid states, and
  observability are explicit;
- candidate shapes were compared when Standard/Heavy applies;
- breaking changes have migration proof, or the chosen shape is additive;
- verification covers the boundary from at least one consumer-visible path.
