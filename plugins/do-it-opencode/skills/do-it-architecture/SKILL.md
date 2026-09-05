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

Ask whether a valid path bypasses a proposed guard and whether the rule would
remain if its current layer were replaced. Derived caches and copies should not
silently become competing authorities.

Explore applicable denial, duplication, races, replay, cancellation, timeout,
and partial or uncertain commit. Identify the recovery owner and the invariant
that survives failure. For a boundary change, account for consumers,
compatibility, migration, rollback, and eventual retirement.

Challenge necessity before adding an abstraction, service, or governance layer.
An independent strategist can test premises without inheriting the author's
conclusion. Use [architecture rationale](references/architecture-rationale.md)
or the [stateful scan](../references/stateful-change-scan.md) where their detail
helps; a private reversible choice does not need a dossier.
