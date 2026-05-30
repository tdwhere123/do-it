# Task Card Template

A lightweight template for non-trivial work that benefits from a
written brief — typically multi-file changes, multi-day efforts,
sub-agent dispatches, or anything that needs review-loop discipline.

For one-shot fixes, just describe scope in the PR body and skip this.

## File Layout

- File path: `.do-it/plans/<task-slug>.md` for in-flight task cards;
  graduated cards may move into a project-specific directory once
  their wave settles.
- File MUST be UTF-8 without BOM, < 30 KB. Localized fixtures inside
  the card are fine.

## Section Order

```
# Implementation Brief: <CARD-ID> — <Title>

> Frontmatter (block-quoted bullet list, fields below)

## 1. Background & Goal
## 2. Allowed Scope
## 3. Deferred
## 4. Acceptance Criteria
## 5. Verification
## 6. Shared File Hazards & Dependencies
```

## Frontmatter Fields

```markdown
> - **Card ID**: <short kebab-case id>
> - **Source/Background**: <link or one-liner>
> - **Target**: `<destination paths inside the repo>`
> - **Size**: <S | M | L | XL>  (S ≤ 5 files, M ≤ 20, L ≤ 100, XL > 100)
> - **Tier**: <Light | Standard | Heavy>  (matches do-it-router)
> - **Prerequisite**: <comma-separated card IDs, or `none`>
> - **Blocks**: <comma-separated card IDs, or `none`>
> - **Owner**: <`unassigned` until claimed>
> - **Grill**: <slug from .do-it/grill/, or `none`>
> - **Brainstorm**: <slug from .do-it/brainstorm/, or `none`>
```

## §1 Background & Goal

Two short paragraphs:

1. **Background**: why this work matters; what subsystem it touches;
   what depends on it.
2. **Goal**: a single sentence stating the one outcome this card
   delivers. One card = one goal.

## §2 Allowed Scope

The exhaustive enumeration of files the card touches. Use
sub-sections per file or per file group. For each file include:

- **Target**: repo-relative path
- **Change**: brief description of what changes and why

## §3 Deferred

Anything intentionally NOT in this card. Each deferral MUST cite a
backlog issue:

```markdown
- <thing> — deferred to backlog #BL-NNN with close condition
  "<one-liner>".
```

If nothing is deferred, write `Nothing deferred.` exactly.

## §4 Acceptance Criteria

A markdown table. Each row has a stable AC ID (AC1, AC2, ...) and an
Evidence column that names a verifiable artifact.

```markdown
| AC | Criteria | Evidence |
|---|---|---|
| AC1 | … | … |
| AC2 | TypeScript compiles | `pnpm exec tsc --noEmit` is clean |
| AC3 | Unit tests pass | `pnpm exec vitest run` is green |
```

## §5 Verification

Concrete shell commands a reviewer can run to verify §4. Order them
build → test → lint → integration.

For Heavy, release/install, multi-agent, or explicit durable-plan work, include
an Evidence Ledger table. Ordinary Light work and one-shot Standard fixes can
skip it.

```markdown
| Claim ID | Readiness target | Truth plane | Ref/path | Evidence | Result | Date | Owner | Residual risk |
|---|---|---|---|---|---|---|---|---|
| C1 | fixture-ready | source-repo | `src/...` | `npm test` | NOT_VERIFIED | YYYY-MM-DD | parent | command not run yet |
```

Allowed `Result` values: `VERIFIED`, `FAILED`, `NOT_VERIFIED`, `BLOCKED`, and
`DEFERRED_BY_USER`.

Allowed truth planes: `source-repo`, `task-worktree`, `integration-worktree`,
`temp-install`, `live-codex`, `live-claude`, `package-artifact`,
`host-behavior`, and `external-blocked`.

Old projects do not need historical backfill. Record a `NOT_VERIFIED` baseline
only when old state affects the current task.

## §6 Shared File Hazards & Dependencies

A short list of shared files this card writes that may collide with
other cards in the same wave. If none, write `No shared-file
hazards.` exactly.

Plus a short dependency restatement (mirrors frontmatter):

```markdown
**Prerequisite**: <card IDs>.
**Blocks**: <card IDs>.
```

## Path Style

All paths are repository-relative
(e.g. `packages/core/src/foo.ts`), never absolute.
