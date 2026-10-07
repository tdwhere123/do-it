# Deep Audit Lenses

Choose the lenses that bear on the selected scope. These are questions for
investigation, not a quota of findings or a requirement to apply every category
to every file. Existing [review lenses](../../references/review-lenses.md),
[architecture judgment](../../do-it-architecture/SKILL.md), and the
[stateful scan](../../references/stateful-change-scan.md) remain the owners of
their general guidance.

## Meaning, identity, and authority

Trace a fact from its producer through admission, storage, projection, and use.
What does each state or identifier actually establish? Preserve distinctions such
as unknown versus absent, valid subset versus completed work, current revision
versus last populated revision, and paid attempts versus durable progress.

Check whether parallel implementations preserve the same rule. A digest may
prove intact content without proving which execution owns it; a saved admission
flag may not authorize replay now. Look for consumers that assign stronger
meaning to an artifact than its producer guarantees. Do not assume the remedy
is a new authority: the contract may already be defined and simply dropped at
one boundary.

## Security and side effects

Start with an actor, accessible input, trust boundary, and reachable effect.
Check alternate legal paths as well as the obvious guarded entry. Path aliases,
symlinks, install/build execution, inherited credentials, and dependency loading
can cross boundaries that a local type or lexical path check does not enforce.
A supposedly read-only inspection may open a writable store before validating it.

A dangerous API, vulnerable dependency version, or comment is a lead, not proof
of an exploitable path. Establish configuration and reachability; distinguish
observed impact from an unverified threat. Do not expose secret values in reports.

## Failure, lifecycle, and recovery

Use the stateful scan for cancellation, races, uncertain commit, replay, and
copied state. Also inspect startup, shutdown, interrupted upgrades, and the
actual owner of resumption or repair. Does retaining a failure status preserve
valid independent results? Can a later observation settle uncertainty, or does
a defensive flag make it permanent? Does retry advance durable state or merely
repeat cost? Ensure success is recorded after the work that could still fail.

## Performance and resource limits

Name the workload, growth dimension, shared resource, and limiting mechanism.
Trace queueing, backpressure, retention, contention, pagination, and cancellation
under that condition. Distinguish a resource charge from retained memory and a
resume token from a live resumable computation.

Inspect feature cost under the same budget: optional metadata can reduce useful
payload or displace required support without changing a binary headline metric.
Require measurement or a concrete complexity/resource argument, not intuition
about a large function. Do not promise measured gains from static inspection.

## Tests and claims

Check whether expected results are independent of the implementation and whether
the production producer-consumer chain is exercised. Real collaborators do not
make an assertion discriminating: a lone fixture may be found by an exhaustive
fallback even when the intended lookup never ran.

Use the counterevidence questions in [coverage](coverage.md). Check provenance,
distractors, negative controls, failure accounting, and persistence of results.
Separate implementation correctness, engineering integration, and user-visible
utility; a build passing or an aggregate improving cannot substitute for all three.

## Runtime data and application boundaries

For typed code, trace untrusted bytes through validation, coercion, serialization,
and legal states; an assertion is not validation. For APIs, inspect compatibility,
error meaning, pagination, idempotency, and callers affected by schema changes.
For frontends, inspect the owner of user-visible state, stale async completions,
cancellation, optimistic recovery, and whether derived UI state hides a domain
failure. Apply only the parts relevant to the application.

## Dependencies, delivery, and maintainability

Look beyond unused imports: consider execution privileges, transitive weight,
maintenance and license fit, upgrade constraints, and the actual build artifact.
Trace installation, configuration defaults, migrations, rollback, and which
shipped copy a user executes. Distinguish source tests from package integration.

Judge duplication by whether it permits competing meanings or missed updates,
not syntax alone. Check documentation against current contracts and examples.
A long file or TODO does not establish a defect; identify the concrete reasoning,
change, or operating risk before recommending a structural change.
