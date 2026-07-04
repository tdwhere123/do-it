---
name: do-it-comments-discipline
description: "Use when code comments are authored or reviewed and must be checked as anchors, invariants, cross-file references, or tool directives instead of narrative."
---

# Do-It Comments Discipline

A comment must answer "what is this for the next reader" — not "what did I just do". Edit-history, task-tracker IDs, and tombstones belong in commit messages or trackers, not in source.

## When To Use

Load before authoring or reviewing comments; on every `Edit|Write|MultiEdit` the `comments-lint` PostToolUse hook also runs as advisory backup; `do-it-review-loop` loads this skill for the comments lens.

## Allowed (5 categories)

A comment is allowed only if it falls into one of these *and* the code does not already say the same thing.

**1. Type annotations** — structured docstrings consumed by tooling (JSDoc, TSDoc, Python docstrings, Rust `///`, Go doc comments).

```ts
/** Rotate the user's auth token; old one is revoked synchronously.
 *  @throws TokenLockedError when another rotation is in flight. */
function rotateToken(userId: string): Promise<string> { ... }
```
✗ `// returns a string` above `rotateToken(...)` — free-form prose, not a doc tag; use `@returns`.

**2. Anchor tokens** — short greppable identifiers for cross-file references. Format: `// @anchor:<kebab-id>` (or `// @marker:<id>`); unique repo-wide.

```ts
// @anchor:auth-token-expiry
const TOKEN_TTL_SECONDS = 900;
```
✗ `// auth-token-expiry-marker` — missing `@anchor:` prefix, `rg` cannot find it.

**3. Cross-file references** — points at another location this code depends on or mirrors. Format: `// see also: <path>:<symbol-or-anchor>`. Repo-relative; prefer symbol/anchor over line number.

```ts
// see also: src/auth/refresh.ts:rotateToken — must stay in sync with @anchor:auth-token-expiry.
```
✗ `// see auth.ts` — no keyword, no symbol; not greppable.

**4. Invariants** — a present-tense assertion the code itself cannot express (preconditions, ordering, threading).

```ts
// invariant: caller already holds the user-row transaction lock.
function bumpLoginCount(userId: string) { ... }
```
✗ `// note: this used to be RSA` — that is history. Restate as `// invariant: only Ed25519 keys are accepted; RSA is rejected at boot.`

**5. Tool / compiler directives** — parsed by tooling: `// @ts-ignore`, `// @ts-expect-error`, `// eslint-disable-next-line`, `// biome-ignore lint/...`, `# noqa`, `# type: ignore`, `# pragma: no cover`, `#[allow(...)]`, `// SAFETY: ...`. The trailing reason must be a real reason.

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape is provider-defined.
const payload: any = JSON.parse(raw);
```
✗ `// disable lint here` — plain English; linters do not parse it.

## Forbidden (6 categories)

Delete, rewrite as one of the 5 allowed shapes, or move into a commit message / ticket.

1. **What-comments** paraphrasing the code: `// loop over items` above `for (const item of items)`. Fix: delete; rename the symbol if needed.
2. **History / change narrative**: `// 之前是 RSA`, `// changed to use Map`, `// 修复了 token 泄漏`. Fix: commit message; or restate as a present-tense invariant.
3. **Task / ticket refs**: `// fix for issue #123`, `// see PR #456`. Fix: pull the issue's content into an invariant or anchor here; keep tracker link in commit body.
4. **Tombstones**: `// removed: legacyValidate()`, `// gone: deprecated handler`. Fix: delete; git history keeps removals.
5. **Orphan TODOs**: `// TODO 后面再处理`, `// TODO: clean this up`. Required shape: `// TODO(@owner): <closing condition or ticket>`.
6. **Fix narratives**: `// fix: handle null user`, `// fixed bug where cache returned stale data`. Fix: invariant or delete; let tests be the proof.

## Review Checklist

For each new or changed comment:
1. Falls into one of the 5 allowed categories? Name which.
2. Already implied by the symbol name, type, or nearby code?
3. Still true in 6 months under normal churn?
4. If a TODO — owner + closing condition?
5. If a cross-file ref — specific enough to grep?
6. If a tool directive — real reason?

Reject (rewrite or delete) when (1) fails, (2) is yes, (3) is no, or (4)/(5)/(6) fails.

## Write-Quality Families (advisory hook)

Comment-related closed-set families (`history`, `fix-narrative`, `task-ref`,
`orphan-todo`, `tombstone`, `what-comment`) and suppress syntax live in
[`../references/write-quality-families.md`](../references/write-quality-families.md)
§ Comments. The merged `write-quality-lint` hook scans newly-added lines; it
never blocks. Family names match the `cause class` slot in
[`do-it-review-loop`](../do-it-review-loop/SKILL.md).

Keyword heuristics (reference only):

- `history` (Chinese narrative): `修改了` `添加了` `新增了` `删除了` `去掉了` `之前是` `原来是` `改成` `曾经`
- `history` (English narrative): `added` `previously` `used to` `changed to` `moved` plus bare `removed` / `deleted` (without trailing `:`)
- `fix-narrative`: `修复` `修正` `fixed` `fix:` `bugfix` `hotfix` `patched`
- `task-ref`: `issue #` `pr #` `ticket #` `jira-`
- `orphan-todo`: `TODO` / `FIXME` / `XXX` not followed by `:` or `(@owner)`
- `tombstone`: `removed:` `deleted:` `gone:`

(See `hooks/comments-lint.sh` for the authoritative regex sets.)

## Stop Conditions

Return a finding instead of silently rewriting when: the comment asserts behavior that needs code evidence; a `see also:` target is missing; deleting would remove the only statement of an invariant; the right fix is a rename owned by another slice.

## Escape Hatch

When narrative truly is the right shape — for example, a file-scope historical migration future readers need:

1. Prefer commit message / CHANGELOG.
2. If it must live in source, keep it at file scope as a structured docstring with an explicit "Historical:" prefix and an anchor pointer to current docs.
3. Per-line opt-out: `// comments-lint-allow: <reason>` on the same or previous line. Use sparingly.

## Output Shape (for fix-loop)

```
- severity: Important
  location: src/auth/token.ts:42
  category: history       # or: what | task-ref | tombstone | orphan-todo | fix-narrative | stale-invariant | broken-reference
  evidence: "// 之前是 RSA，现在改成 Ed25778" (matched: 之前是, 改成)
  suggested fix: rewrite as invariant — "// invariant: only Ed25519 keys are accepted; RSA is rejected at boot."
```

`category` is the same slot as `cause_class` in [`workflow-kernel.md`](../references/workflow-kernel.md) § Finding Schema. `severity: Blocking` is reserved for comments asserting falsehoods (stale invariants, dangling `see also:`).

## Verification (pass criteria)

A comments pass is clean when:

- every changed comment is classified into one of the 5 allowed categories or removed;
- every `see also:` target is greppable by path plus symbol or anchor;
- every TODO has an owner and closing condition;
- every tool directive uses the language/tool's actual directive syntax with a real reason;
- every `comments-lint` hook hit is rewritten, removed, or explicitly suppressed with `comments-lint-allow: <reason>`.

If any item above fails, the diff carries a `do-it-fix-loop` finding (see Output Shape).

## Trigger Event

- **Pre-edit discipline**: when an edit will author comments, load this checklist before writing. The PostToolUse hook is backup, not the first gate.
- **PostToolUse hook** (`comments-lint.sh`, matcher `Edit|Write|MultiEdit`): scans newly-added comment lines, emits one advisory `system-reminder` per file, never blocks.
- **Review lens**: `do-it-review-loop` Standard+ runs the comments lens when the diff includes comment changes and walks this checklist on every changed comment.
- **Skip**: include `yolo` in the next message or run `/do-it-skip gate` to bypass the verification-gate; the lint reminder still emits (advisory only) and individual lines can carry `comments-lint-allow: <reason>`.

## Related Skills

- `do-it-review-loop` — invokes this skill for the comments lens; the same `cause class` vocabulary lives in both places.
- `do-it-fix-loop` — consumes the Output Shape above.
- `do-it-context` — for recurring terms, promote into `.do-it/CONTEXT.md` instead of repeating invariants per caller.
