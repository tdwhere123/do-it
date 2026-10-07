# Architecture Rationale

This file offers deeper lenses and concrete failure mechanisms behind
architectural questions. Use the detail that can change the design; the
headings are navigation aids, not a required or exhaustive decision model.

Negative-path body for stateful, async, retried, cached, queued, or
cross-boundary work lives in
[`../../references/stateful-change-scan.md`](../../references/stateful-change-scan.md).
Failure & Recovery points at that scan; it does not copy the five faces.

## Optional navigation map

These groupings help locate relevant lens detail. They do not require a
project surface map or bidirectional map maintenance.

| Surface | Absorbs | Stop / finding the surface must still catch |
| --- | --- | --- |
| **Spine & Surfaces** | L1 Spine, L2 Surfaces | Unnamed entry/mutation/accept/effect/completion/recovery point; public or persisted break without consumers or cutover. |
| **Authority & Ownership** | L3 Authority, L4 Ownership | Collapsed semantic/admission/projection/recovery; invented sole owner or "everyone owns it"; copy treated as source. |
| **Failure & Recovery** | L5 Negative path | Named recovery route without trigger, owner, terminal invariant, or evidence; uncertain commit with no recovery. |
| **Change & Cutover** | L8 Change/deletion | Rewrite from whole-target replacement; deletion without dependents; new noun that adds more ambiguity than it removes. |
| **Governance** | L6 Guards, L7 Governed path | Guard that cannot detect a violation; exception list that only grows; honest path costlier than bypass. |

## Progressive lens detail

Use a relevant lens when the short question is not enough.

| Lens | Question | Closure |
| --- | --- | --- |
| **L1 Spine** | Which entry, mutation, accepted-state, visible-effect, completion, and recovery points are load-bearing? | Smallest repository-named spine; every new/omitted point justified; changed path or retired path named. |
| **L2 Surfaces** | Is each surface public, persisted, cross-boundary, or private? | Narrowest compatibility promise; consumers and cutover/deprecation known before a break. |
| **L3 Authority** | Per fact and jurisdiction, who decides truth and who may write through which route? | Fact/decision authority, owner, admission, partition/replica, commit/conflict, projection, and recovery dimensions kept independent where applicable. |
| **L4 Ownership** | Who owns each fact, contract, boundary decision, and lifecycle? | Owner, decision rights, escalation, non-ownership, and public/assembly crossing identified; no shared layer merely because two consumers exist. |
| **L5 Negative path** | What happens on applicable denial, failure, partial/stale/cancelled work, timeout, duplicate/order/conflict/partition, uncertain commit, retry/restart/replay? | Trigger, authority, owner, repair/reconciliation, terminal invariant, evidence, and failed-convergence escalation. Load the stateful scan when those faces apply. |
| **L6 Guards** | Which material rules justify enforcement, and can the check detect a violation? | Traceable reason, proportionate falsifiable check or auditable review; exception baseline shrink-only. |
| **L7 Governed path** | Where is the honest path costlier than bypass? | Avoidable friction removed without weakening controlling policy; recurring bypass treated as a routing signal. |
| **L8 Change/deletion** | Does a new noun/layer remove more ambiguity than it adds, and what does it retire? | Net-growth review; smallest replaceable slice and preserved contracts before rewrite; whole replacement only when smaller migration is evidenced riskier. |

## Failure modes → surfaces

| Failure mode | Mechanism — why it keeps happening | Surface (lens) |
| --- | --- | --- |
| Spine bloat | Adding an authority or completion path outside the declared model is locally cheaper than negotiating a boundary and reconciliation rule; the integration cost is deferred to every future reader. | Spine & Surfaces (L1) |
| Execution-topology collapse | Equating one load-bearing decision chain with one controller, process, or plan flattens legitimate replaceable mechanisms and leaks today's execution topology into the architecture contract. | Spine & Surfaces (L1) |
| Accidental stability | Exporting is one keystroke; the promise it creates is invisible until changing it breaks a consumer. A declared clean target can be mistaken for cutover authority while consumers, data, old routes, or recovery remain unresolved. | Spine & Surfaces (L2); Change & Cutover (L8) |
| Load-bearing accident | With enough consumers, every observable behavior is depended on regardless of intent (Hyrum's law). The contract you wrote is a subset of the contract you actually shipped. | Spine & Surfaces (L2) |
| Truth fragmentation | Replicas and generated files are easier to hand-edit than their sources, so provenance and reconciliation decay. | Authority & Ownership (L3) |
| Projection-category collapse | Treating a file kind (cache, transcript, view) as permanently non-authoritative hides independent operational facts it legitimately owns, while failing to identify which source facts it merely projects. | Authority & Ownership (L3) |
| Authority-model collapse | Fact authority, ownership, write admission, partition, replication, commit, conflict, and recovery are orthogonal. Treating them as competing types — or forcing one writer or owner — destroys availability and jurisdiction semantics. | Authority & Ownership (L3, L4) |
| Ambiguous ownership | Accountability decays silently when decision rights, partitions, tie-breakers, or lifecycle responsibility are missing. Either "everyone owns it" or an invented sole owner conceals the defect. | Authority & Ownership (L4) |
| Sideways coupling | Reaching into another domain's internals is one import; negotiating a declared public surface is a design conversation. Selection favors the import; deletability dies first, replaceability second. | Authority & Ownership (L4) |
| Shared-kernel dumping | Moving domain semantics into a generic lower layer satisfies the import graph immediately, but erases focused accountability and turns the shared layer into a permanent coordination tax. | Authority & Ownership (L4) |
| Happy-path architecture | Demos reward the happy path. A named recovery route creates false closure without a trigger, decision authority, owner, terminal invariant, and completion evidence. | Failure & Recovery (L5) |
| Time-axis leaks | Components are tested in single-process, single-run harnesses; restart, retry, replay, and uncertain commit exist only in production. | Failure & Recovery (L5) |
| Paper boundaries | An unowned prose-only rule is easy to bypass and forget. Material rules need proportionate falsifiable enforcement; when automation is not justified, the review mechanism and its evidence must still be explicit and auditable. | Governance (L6) |
| Wallpaper guards | A guard that never fires is indistinguishable from a working one until someone plants a violation. Noisy guards get disabled; silent ones get trusted. | Governance (L6) |
| Exception accretion | Each exception is individually reasonable; the list only grows because removal has no owner and no deadline. | Governance (L6) |
| Pricing inversion | After controlling product, safety, security, privacy, or compliance requirements, avoidable cost still selects the bypass under deadline, and each successful bypass lowers the social cost of the next. | Governance (L7) |
| Concept inflation | Naming a new thing is the author's joy and the reader's tax, and the tax is invisible in the PR that adds it. Saturated cognition breeds patch-on-patch. | Change & Cutover (L8) |
| Rewrite gravity | Once comprehension cost exceeds rewrite cost for one individual, the rewrite looks locally rational; the institutional knowledge it destroys was never on that individual's balance sheet. | Change & Cutover (L8) |
| Knowledge evaporation | Reasons live in heads and chat logs; rules live in files. The rule outlives the reason and becomes either superstition (kept in fear) or noise (deleted in ignorance). | Governance (L6) |

## Provenance

What each lens borrows, so the borrowing can be re-examined at the source if a
lens comes under question:

- **Linux** — graded stability (userspace contract sacred, in-kernel
  interfaces refuse stability promises) → L2 / Spine & Surfaces.
- **Git** — plumbing/porcelain stability split → L2 / Spine & Surfaces.
- **SQLite** — invariants sunk into file formats, state machines, and a test
  corpus rather than convention → L6 / Governance.
- **PostgreSQL** — change classes, upgrade paths, and deprecation as routine
  institutions rather than heroics → L8 / Change & Cutover.
- **Hyrum's law** → L2 / Spine & Surfaces; **Gall's law** → L1 / Spine & Surfaces.
- **Conway's law, attention form** — structure mirrors the communication
  structure of its maintainers; for agent-maintained code that structure is
  the context window, so architecture that cannot be navigated in bounded
  reads will be bypassed, then forgotten → L1, L7 / Spine & Surfaces,
  Governance.

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
- **Stateful-scan faces on the hot path** — Identity, Interleaving, Commit,
  Amplification, and Copies & Recovery stay in the on-demand reference.
- **Architecture dossier for a private reversible choice** — local helper
  splits, cheap-to-reverse internals, and single-caller edits stay with
  `do-it-code-quality`; they do not open an architecture route.
