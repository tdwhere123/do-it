# Decision Resolvers

Unknown types, resolver examples, research-first surfaces, and prototype
routing. The five-step algorithm lives in `do-it-decide`. Do not copy Core
rule sentences here; cite `core §r-evidence` and `core §r-uncertainty`.

## Unknown types

Name the unknown by what a wrong answer would change:

| Kind | Typical cheapest resolver |
| --- | --- |
| Readable fact | Repo, runtime, or local docs |
| Blind spot the user did not think to consider | Short pass over failure modes / axes, then one decision |
| Tacit preference (recognize, cannot name) | Reference, two live options, or cheapest prototype |
| User-owned choice | One question, recommended default |
| Permanent external surface | Repo constraints + ≥2 candidates + primary sources |
| Load-bearing premise | Falsify locally, then one second look only if costly |

Helper names, local splits, and cheap-to-discover implementation detail are
not decision-changing. Resolve them in execution.

## Resolver ladder

Stop at the first rung that is reliable enough:

1. **Repo evidence** — files, tests, git, runtime (`core §r-evidence`).
2. **Reference** — existing product behavior, handbook, or a concrete example
   the user can recognize.
3. **One user decision** — only for a material choice the environment cannot
   provide. Ask **one** question; wait.
4. **Research** — official docs and source repos over summaries.
5. **Experiment / prototype** — the cheapest artifact that makes the choice
   visible.
6. **One fresh-context second look** — last, not default. Subagents are last.

Never skip to interview or workers because the task feels large.

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
permanent external surface: inspect repository constraints, compare at least
two viable candidates, and record compatibility, maintenance/activity,
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
