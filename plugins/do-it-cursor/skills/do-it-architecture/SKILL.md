---
name: do-it-architecture
description: "Use when authority, ownership, contracts, dependency boundaries, migration, recovery, or structural deletion can change a design."
---

# Architecture

Locate the load-bearing path from entry through mutation and accepted state to
visible effect and recovery. Distinguish public, persisted, cross-boundary, and
private surfaces; the narrowest actual compatibility promise matters.

Separate semantic authority (meaning and legal states), admission (permitted
input or mutation), projection (derived views), and recovery (committed, retry,
repair, or reconcile). One semantic authority does not require one physical
writer. Place policy with the owner of end-to-end intent.

Before encoding business branches, ask what data, legal states, and access
patterns the work needs. A type, state machine, or registry that makes an invalid
combination unrepresentable is a foundation; a framework around one feature is
not. Another branch that must stay in sync with the last one, or modules named
only for load-validate-save order, is a sign the domain is still in conditionals.

Test the proposed boundary with a counterexample: can another legitimate writer,
retry, or import bypass this guard? Would the rule still be needed if the UI or
adapter were replaced? Validate untrusted data where it enters. Re-checking the
same rule deeper does not replace a missing boundary, and a boundary check does
not replace an internal contract if another writer can enter. A check in one
adapter does not establish a shared storage invariant; conversely, not every
local input check belongs in a central service. Derived caches and copies should
not silently become competing authorities.

Explore applicable denial, duplication, races, replay, cancellation, timeout,
and partial or uncertain commit. Identify the recovery owner and the invariant
that survives failure. For example, a timeout after a durable write is not proof
that nothing happened: who can reconcile it without repeating the effect? When
concurrent writers only need independent facts, give them independent state
before adding a lock.

For a boundary change, account for consumers, compatibility, migration, rollback,
and eventual retirement. If this requirement had existed on day one, would the
current split still be the design? If not, move toward that shape in verifiable
steps rather than bolting a parallel path onto a now-false assumption. Temporary
breakage is acceptable only inside an authorized, isolated migration that live
consumers will not load. Reversibility does not make a broken live reload safe:
an identity-only cutover still needs its paired runtime change before a
live-linked caller would pick it up. The destination still needs a complete
check. This is a cutover question, not a rollout framework. When nothing outside
the repo promised compatibility, migrate remaining callers and delete the old
API in the same wave; a configured reference is still a caller.

Challenge necessity before adding an abstraction, service, or governance layer.
An independent strategist can test premises without inheriting the author's
conclusion. Use [architecture rationale](references/architecture-rationale.md)
or the [stateful scan](../references/stateful-change-scan.md) where their detail
helps; a private reversible choice does not need a dossier.
