# Coverage and Evidence

## Define the examined population

Record the repository revision and relevant working-tree changes. Enumerate the
selected scope before distributing it, including tests, build and installation
scripts, configuration, schemas, and documents that define behavior. Reconcile
that inventory with the returned inspections. If files change during the audit,
refresh the affected evidence and interactions rather than attaching an old
finding or clean result to a new revision.

For a full-repository request, inspect all included files, not only entry points
and their immediate callees. For a selected subsystem or change, follow the
contracts necessary to understand its behavior; distinguish that dependency
inspection from enlarging the requested audit scope. Name an outside dependency
that could invalidate the conclusion instead of silently declaring it covered.

Make exclusions visible. Repository metadata, caches, build output, vendored
code, and binary assets often need different treatment from maintained source:

- Generated copies may be checked through the generator and a source/output
  consistency check. Record that evidence rather than claiming manual inspection
  of each copy. Do not mistake maintained adapters inside generated directories
  for generated files.
- Vendored code can be an excluded implementation but still an inspected version,
  license, configuration, or trust boundary. Explain that distinction.
- For binary assets, state the relevant format, provenance, metadata, or consumer
  checks; a path listing is not a content review.

These are possible treatments, not permission to omit material the user included.
Resolve a scope-changing exclusion with the user. Do not treat an excluded or
unread file as clean, or shrink the agreed scope merely to claim completion.

## Account for inspection, not tool activity

A lightweight map in working context is enough: file or section, assigned reader,
inspection evidence, open cross-file questions, and remaining work. Use existing
host/task facilities if helpful; no new storage format or on-disk ledger is needed.

Keep these distinctions explicit:

- Inventoried or searched, but not substantively inspected.
- Partially inspected, with exact remaining sections or paths.
- Inspected for the selected risks, with relevant interactions checked.
- Excluded, with the reason and any alternative evidence.

Read large files in bounded sections and follow material branches. Tool output
truncation is an unread segment, not successful coverage. A file with no finding
still needs examination; the number of findings says nothing about coverage.
If time, tools, or context prevent completion, return the remaining frontier and
a partial result rather than quietly switching to sampling.

Module slices help distribute the inventory. Risk perspectives can cross those
slices: check producer-consumer agreement, alternate entry points, copied state,
serialization, lifecycle transitions, and test/configuration wiring. A collection
of locally clean files can still violate a shared contract. Avoid both unowned
files and unnecessary repeated full reads by every specialist.

## Preserve the evidentiary chain

A finding needs a source location, the violated requirement or invariant, a
reachable triggering condition, and a consequence. Distinguish source tracing,
historical reports, and an actually run reproduction. A passing command proves
only its exercised claim; record unavailable checks without inventing outcomes.
Run probes only within the user's authorization and the host's permissions.

Seek counterevidence before promotion: another valid producer, an intentional
policy, an earlier guard, an alternate delivered witness, or a different failure
owner. Retain rejected candidates and their reasons so later aggregation does
not turn them back into defects. Deduplicate copies and re-reviews of one episode
rather than counting them as independent evidence of a systemic problem.

Test the diagnosis with a distinguishing observation. Would the same test pass
if the intended mechanism were disabled, a fallback supplied the output, or a
cache reused old state? Prefer competing inputs, provenance checks, negative
controls, or public-path traces that separate those explanations. Do not modify
production behavior merely to make an audit probe convenient.
