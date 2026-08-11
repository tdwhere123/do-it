# Architecture Rationale

SKILL.md states the lenses; this file records what the lenses cannot carry:
the failure mode each lens exists to close. Read it when deciding whether a
lens still earns its place — a lens is retired by checking whether its failure
mode still operates, not by vote or by feel.

## Failure modes → lenses

Keep this map true in both directions: a failure mode with no lens, or a lens
with no mechanism here, is drift.

| Failure mode | Mechanism — why it keeps happening | Lens |
| --- | --- | --- |
| Spine bloat | Adding an authority or completion path outside the declared model is locally cheaper than negotiating a boundary and reconciliation rule; the integration cost is deferred to every future reader. | L1 |
| Execution-topology collapse | Equating one load-bearing decision chain with one controller, process, or plan flattens legitimate replaceable mechanisms and leaks today's execution topology into the architecture contract. | L1 |
| Accidental stability | Exporting is one keystroke; the promise it creates is invisible until changing it breaks a consumer. A declared clean target can be mistaken for cutover authority while consumers, data, old routes, or recovery remain unresolved. | L2 |
| Load-bearing accident | With enough consumers, every observable behavior is depended on regardless of intent (Hyrum's law). The contract you wrote is a subset of the contract you actually shipped. | L2 |
| Truth fragmentation | Replicas and generated files are easier to hand-edit than their sources, so provenance and reconciliation decay. | L3 |
| Projection-category collapse | Treating a file kind (cache, transcript, view) as permanently non-authoritative hides independent operational facts it legitimately owns, while failing to identify which source facts it merely projects. | L3 |
| Authority-model collapse | Fact authority, ownership, write admission, partition, replication, commit, conflict, and recovery are orthogonal. Treating them as competing types — or forcing one writer or owner — destroys availability and jurisdiction semantics. | L3, L4 |
| Ambiguous ownership | Accountability decays silently when decision rights, partitions, tie-breakers, or lifecycle responsibility are missing. Either "everyone owns it" or an invented sole owner conceals the defect. | L4 |
| Sideways coupling | Reaching into another domain's internals is one import; negotiating a declared public surface is a design conversation. Selection favors the import; deletability dies first, replaceability second. | L4 |
| Shared-kernel dumping | Moving domain semantics into a generic lower layer satisfies the import graph immediately, but erases focused accountability and turns the shared layer into a permanent coordination tax. | L4 |
| Happy-path architecture | Demos reward the happy path. A named recovery route creates false closure without a trigger, decision authority, owner, terminal invariant, and completion evidence. | L5 |
| Time-axis leaks | Components are tested in single-process, single-run harnesses; restart, retry, replay, and uncertain commit exist only in production. | L5 |
| Paper boundaries | An unowned prose-only rule is easy to bypass and forget. Material rules need proportionate falsifiable enforcement; when automation is not justified, the review mechanism and its evidence must still be explicit and auditable. | L6 |
| Wallpaper guards | A guard that never fires is indistinguishable from a working one until someone plants a violation. Noisy guards get disabled; silent ones get trusted. | L6 |
| Exception accretion | Each exception is individually reasonable; the list only grows because removal has no owner and no deadline. | L6 |
| Pricing inversion | After controlling product, safety, security, privacy, or compliance requirements, avoidable cost still selects the bypass under deadline, and each successful bypass lowers the social cost of the next. | L7 |
| Concept inflation | Naming a new thing is the author's joy and the reader's tax, and the tax is invisible in the PR that adds it. Saturated cognition breeds patch-on-patch. | L8 |
| Rewrite gravity | Once comprehension cost exceeds rewrite cost for one individual, the rewrite looks locally rational; the institutional knowledge it destroys was never on that individual's balance sheet. | L8 |
| Knowledge evaporation | Reasons live in heads and chat logs; rules live in files. The rule outlives the reason and becomes either superstition (kept in fear) or noise (deleted in ignorance). | L6 |

## Provenance

What each lens borrows, so the borrowing can be re-examined at the source if a
lens comes under question:

- **Linux** — graded stability (userspace contract sacred, in-kernel
  interfaces refuse stability promises) → L2.
- **Git** — plumbing/porcelain stability split → L2.
- **SQLite** — invariants sunk into file formats, state machines, and a test
  corpus rather than convention → L6.
- **PostgreSQL** — change classes, upgrade paths, and deprecation as routine
  institutions rather than heroics → L8.
- **Hyrum's law** → L2; **Gall's law** → L1.
- **Conway's law, attention form** — structure mirrors the communication
  structure of its maintainers; for agent-maintained code that structure is
  the context window, so architecture that cannot be navigated in bounded
  reads will be bypassed, then forgotten → L1, L7.

## Deliberate omissions

Recorded so they are not "discovered missing" and re-added by accident:

- **Solution shapes** (event sourcing, CQRS, microservices vs monolith,
  hexagonal, …) — the skill governs how a shape is chosen, bounded, and kept
  honest, not which shape to choose.
- **Org-design mechanics** (maintainer hierarchies, RFC committees) — they
  presume a human organization; the protocol must also work for a single agent
  session.
- **Mandatory documentation tooling** — the skill states the invariant and
  defaults to repository-native mechanisms.
- **Repository-specific topology and contract vocabulary** — the skill reads
  and obeys authoritative project sources; it does not copy them into a
  generic rule set.
