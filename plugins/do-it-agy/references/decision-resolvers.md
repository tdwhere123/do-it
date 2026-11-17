# Decision Resolvers

Choose an evidence source that can resolve the actual decision-changing unknown.

## Unknown types

Name the unknown by what a wrong answer would change:

| Kind | Typical cheapest resolver |
| --- | --- |
| Readable fact | Repo, runtime, or local docs |
| Blind spot the user did not think to consider | Short pass over failure modes / axes, then one decision |
| Tacit preference (recognize, cannot name) | Reference, two live options, or cheapest prototype |
| User-owned choice | One question, recommended default |
| Permanent external surface | Repo constraints and relevant primary sources |
| Load-bearing premise | A falsifier or independent premise challenge |

Helper names, local splits, and cheap-to-discover implementation detail are
not decision-changing. Resolve them in execution.

## Useful resolvers

Repository evidence, references, user decisions, research, prototypes, and
independent contexts are complementary methods. Choose by the uncertainty and
the cost of being wrong, not a prescribed order. Independent evidence gathering
is especially useful when current reasoning may be anchored.

## Taught decision

If the user cannot evaluate the options, do not extract a guess. Teach the
real trade-off in one pass (what each route spends, what it protects, what
it makes expensive), recommend a default, and wait for a yes/no or a named
pick.

## Load-bearing axes

Alternatives that differ only in naming, folder layout, or cosmetic API
shape are not options. A real fork differs on at least one of: framing,
seam, authority, flow, dependency, reversibility, optimization target, or
scope.

A **dominant route** wins every must with less concept growth and no hidden
caller cost. Otherwise record the **decision boundary**: the fact under
which each viable route wins. Scoring a pros/cons average is not a boundary.

## Research-first surfaces

For a new dependency, datastore, framework/runtime, protocol, or other
permanent external surface: inspect repository constraints, compare viable candidates when the choice is open, and record compatibility, maintenance/activity,
license, operational fit, and a recommendation. Ask the user only when a
preference changes the selected route; never memory-pick a permanent
dependency. Cite primary sources (official docs, the source repo) over
summaries.

## Prototype routing

Use a prototype when the user can recognize the right answer but cannot
specify it, and a reference is missing or ambiguous. Keep it the cheapest
useful artifact (two screens, one tracer path, one data shape) — not a
second implementation. Promote the winner into the contract; delete or
clearly mark the rest.
