# Runtime Status

Current implementation status and known wiring gaps. This file is the
agent-readable answer to "what works today, what is half-wired, what
is not started yet".

> Replace the placeholders. The status labels below are the project's
> source of truth for readiness — pick the same labels everywhere.

## Readiness Labels

- `not-started` — no code or schema yet.
- `schema-ready` — domain types, schema, or interface stubs land but
  no business logic.
- `implementation-ready` — business logic and unit tests land; not
  wired to runtime entrypoints yet.
- `live-event-ready` — wired to the runtime event/transport layer;
  fixture-tested end-to-end internally.
- `workflow-synced` — source and live host surfaces have matching install or
  doctor proof.
- `mcp-consumable` / `cli-consumable` / `http-consumable` — surfaced
  to the relevant external client.

A feature listed below should carry exactly one label.

## Truth Planes

- `source-repo`
- `task-worktree`
- `integration-worktree`
- `temp-install`
- `live-codex`
- `live-claude`
- `package-artifact`
- `host-behavior`
- `external-blocked`

## Status Table

| Area | Owner | Status | Last verified | Notes |
|---|---|---|---|---|
| _<area>_ | _<package or person>_ | `not-started` | _<YYYY-MM-DD>_ | _<one-liner>_ |
| _<area>_ | _<...>_ | `schema-ready` | _<...>_ | _<...>_ |

## Known Wiring Gaps

> Concrete, named gaps. Each entry pairs with either a backlog issue
> (`#BL-NNN`) or a tracked task card.

- _<area>_: _<what is missing>_, tracked at _<#BL-NNN or
  task-card path>_.

## Recently Closed (last quarter)

> Move entries here when a feature reaches its terminal status; keep
> 1-2 quarters of recent history for context, then prune.

(none yet)

## Verification Commands

Each readiness label should map to at least one runnable command that
proves the label is honest. Project-specific examples:

- `<command>` — proves _<area>_ is `implementation-ready`.
- `<command>` — proves _<area>_ is `live-event-ready`.
