# Architecture

Stable system shape. Update this file when packages, services,
ownership boundaries, or major adapters change. Do not update for
per-feature implementation details — those go in `code-map.md`.

> Replace the placeholders. Architecture is best read in 10 minutes;
> if this file grows past ~200 lines, split out a sub-architecture
> page rather than expanding here.

## One-Sentence Frame

_<one sentence describing what this project is, the user it serves,
and the boundary it owns>_.

## Package / Service Shape

```text
<top-level layout>
  <package or service>     <one-line responsibility>
  <package or service>     <one-line responsibility>
  ...
```

## Dependency Direction

```text
<upstream>  ─►  <midstream>  ─►  <downstream>
```

Rules:

- _<which packages may depend on which; cite the invariant number>_.
- _<which adapters are the only exit points; cite the invariant
  number>_.

## Key Abstractions

| Abstraction | Owner | Lifetime | Notes |
|---|---|---|---|
| _<name>_ | _<package>_ | _<per-turn / durable / runtime-only>_ | _<one-liner>_ |
| _<name>_ | _<package>_ | _<...>_ | _<...>_ |

## External Boundaries

- _<inbound: HTTP / MCP / CLI / event consumer>_
- _<outbound: provider API / queue / database>_
- _<observability: logs / metrics / traces>_

## Operational Shape

- _<deploy unit, e.g. a single binary, a daemon + worker, a serverless
  bundle>_
- _<state ownership, e.g. local SQLite, managed Postgres,
  read-replicated cache>_
- _<failure isolation, e.g. one process per tenant, single-process
  with fault domains>_

## Out Of Scope

Things this architecture deliberately does **not** include. Naming
them here prevents review drift.

- _<not a multi-tenant SaaS>_
- _<not a hot-path system requiring sub-100ms latency>_
- _<not an offline / edge target>_
