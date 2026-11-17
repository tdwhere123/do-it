# Coverage and Evidence

Contents: examined population; layers and chains; accounting for inspection;
the evidentiary chain.

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
- Lockfiles need dependency/version and integrity evidence appropriate to their
  consumers, reconciled with manifests and resolution rules; line-by-line reading
  of machine records is not the goal.
- Vendored code can be an excluded implementation but still an inspected version,
  license, configuration, or trust boundary. Explain that distinction.
- For binary assets, state the relevant format, provenance, metadata, or consumer
  checks; a path listing is not a content review.

These are possible treatments, not permission to omit material the user included.
Resolve a scope-changing exclusion with the user. Do not treat an excluded or
unread file as clean, or shrink the agreed scope merely to claim completion.

## Layers and chains

Layers are levels of question, not directories. Each catches defects the others
cannot:

- **Unit:** local behavior, error handling, and reachability within a file.
- **Module boundary:** responsibility, dependency direction, interface shape,
  and whether a boundary hides volatile detail or forces coordinated edits.
- **Contract:** agreement between producers and consumers across modules,
  including serialization, copied state, lifecycle transitions, and alternate
  entry points.
- **Delivery:** build, installation, generated copies, configuration defaults,
  migrations, and documentation against the artifact a user actually runs.
- **Intent:** the promises the project states in its README, specifications,
  instructions, and tests, compared with delivered behavior.

Apply a layer where the map shows something to ask at that level; a small
private helper rarely needs delivery or intent questions.

A chain is an end-to-end path from an entry (command, request, event, hook,
install or build step, scheduled job) through admission, transformation, state,
effect, and recovery. Select the chains that carry the project's stated
promises, cross trust boundaries, mutate durable state, or deliver shipped
artifacts. Prefer a few complete chains to many partial ones. One reader follows
each selected chain across every hop so that a dropped field, a bypassed guard,
or a disagreeing copy is visible in one context. Record each chain's hops, the
contracts checked at each, and where it stopped being followed.

## Account for inspection, not tool activity

The parent keeps a compact coverage map in working context: inventory and
inspection owners, substantive inspection evidence, layers asked, chains
followed, independent synthesis, and remaining work. Assignment is not inspection; file
inspection is not contract coverage; neither substitutes for synthesis. Delegates
return compact scope and gaps, not separate exhaustive ledgers. No mandatory
Markdown artifact, new storage format, or on-disk ledger is needed.

Keep these distinctions explicit:

- Inventoried, assigned, or searched, but not substantively inspected.
- Partially inspected, with bounded remaining questions or file regions.
- Substantively inspected for file-appropriate risks, with supporting evidence.
- Chains followed end to end, partially followed with a named stopping hop, or
  still pending, independently of file coverage.
- Independently synthesized findings, with unresolved disputes or uncertainty.
- Excluded, with the reason and any alternative evidence.

Read large files in bounded sections and follow material branches. Match depth
to the file's role and risk while covering all maintained source; every line need
not receive identical effort. Tool output truncation is an unread segment, not
successful coverage. A file with no finding still needs examination; the number
of findings says nothing about coverage. Continue agreed pending scope through
bounded follow-ups. If time, tools, or context prevent completion, return the
remaining frontier and a partial result rather than quietly switching to sampling.

Reuse valid evidence across rounds and new synthesizers, including clean
inspections and rejected candidates. Refresh only what changed or what a gap,
critical uncertainty, conflict, or new finding puts in doubt. Do not reset the
inventory or repeat full reads just to produce a formal complete status.

Module slices distribute file inspection; chains cross those slices. Avoid both
unowned files and repeated full reads by readers whose lenses could have shared
one reading.

## Preserve the evidentiary chain

A defect finding needs a source location, the violated requirement or invariant,
a reachable triggering condition, and a consequence. A maintenance finding needs
location, concrete reasoning/change/operating cost, and evidence that deletion,
merge, or reuse can preserve required contracts; no runtime bug is necessary.
Check dynamic and externally delivered consumers before declaring code unused.
Distinguish source tracing, historical reports, and an actually run reproduction.
A passing command proves only its exercised claim; record unavailable checks
without inventing outcomes.
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
