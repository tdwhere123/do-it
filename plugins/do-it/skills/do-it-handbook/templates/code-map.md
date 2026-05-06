# Code Map

Current implementation locations. Refresh when packages, routes,
repos, migrations, or runtime wiring change.

This file is maintained by the `code-mapper` agent. The "Current
implementation locations" section is the agent's write target. Other
sections may be hand-maintained.

<!-- stale: false -->

## Package / Service Naming

| Path | Public name | Notes |
|---|---|---|
| _<path>_ | _<name>_ | _<one-liner>_ |
| _<path>_ | _<name>_ | _<...>_ |

## Project Map

```text
<repo root>/
  <top-level>/
    <package or service>     <one-line responsibility>
    ...
```

## Current Implementation Locations

> The `code-mapper` agent rewrites this section. Anything below this
> heading and above the next `##` may be replaced wholesale.

- entry points: _<file:line for the main entry, route table, CLI
  command set>_
- request/event lifecycle: _<producer → contract → transport →
  consumer → state>_
- key services and owners: _<service name → owning file>_
- migrations and schema: _<migration directory, latest migration>_
- public surface: _<API routes, MCP tools, CLI commands>_

## Where To Find Things

- Tests: _<directory>_ — run with `<command>`.
- Type definitions: _<directory>_ — convention `<one-liner>`.
- Configuration: _<file>_ — _<env var or file format>_.
- Docs: _<directory>_ — `maintenance.md` governs updates.

## Conventions

- Path style is repository-relative
  (e.g. `packages/core/src/foo.ts`), never absolute.
- File names use _<kebab-case / snake_case / PascalCase>_ (project
  convention; pick one).
- New `code-map.md` entries reference symbols, not arbitrary text;
  if the symbol gets renamed, this file follows.
