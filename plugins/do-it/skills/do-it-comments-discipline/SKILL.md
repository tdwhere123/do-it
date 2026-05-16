---
name: do-it-comments-discipline
description: "Use when code comments are authored or reviewed and must be checked as anchors, invariants, cross-file references, or tool directives instead of narrative."
---

# Do-It Comments Discipline

## Purpose

Use this to keep comments useful as future search/index anchors instead of
turning the codebase into a diary. A comment must answer "what is this for the
next reader" — not "what did I just do". Edit-history, task-tracker IDs, and
tombstones belong in commit messages, issue trackers, or version control, not
in source.

The default failure mode this skill prevents: an LLM (or human) edits a file,
leaves a "fixed bug" / "added Y" / "removed Z" / "TODO later" comment, and
six months later the next reader has to re-derive whether the comment is still
true. Most of the time it is not.

## When To Use

- Authoring new code or editing existing code that introduces or mutates
  comments.
- Reviewing a diff that adds or modifies comments.
- Before Standard or Heavy edits that will author comments, check planned
  comment text before writing. The PostToolUse hook is a backup reminder, not
  the first time this skill should be considered.
- Triggered automatically by the `comments-lint` PostToolUse hook after an
  Edit / Write / MultiEdit lands on a source file.
- Loaded explicitly by `do-it-review-loop` when the comments lens runs.

## Allowed (5 categories)

A comment is allowed when it falls into one of these and the code itself does
not already say the same thing.

### 1. Type annotations

Structured docstrings consumed by tooling — JSDoc, TSDoc, Python docstrings,
Rust `///` / `//!`, Go doc comments, Java `/** */`.

- Goal: feed the language server, doc generator, or type checker.
- Allowed even when slightly redundant with the signature, because tooling
  consumes them.

```ts
/**
 * Rotate the user's auth token. Returns the new token; the old one is
 * revoked synchronously before this resolves.
 *
 * @throws TokenLockedError when another rotation is already in flight.
 */
function rotateToken(userId: string): Promise<string> { ... }
```

✗ Near-miss (looks like a type annotation but is not):

```ts
// returns a string
function rotateToken(userId: string) { ... }
```

Free-form prose, not a structured doc tag. Tooling does not consume it. Use
`/** @returns {string} */` (or the language's docstring shape) instead.

### 2. Anchor tokens

A short, greppable identifier that lets future readers (or other comments)
point to this exact location.

- Format: `// @anchor:<kebab-id>` or `// @marker:<id>`.
- Must be unique inside the repo for cross-file `see also:` references to
  work.

```ts
// @anchor:auth-token-expiry
const TOKEN_TTL_SECONDS = 900;
```

✗ Near-miss (looks like an anchor but is not greppable as one):

```ts
// auth-token-expiry-marker
const TOKEN_TTL_SECONDS = 900;
```

No `@anchor:` (or `@marker:`) prefix, so cross-file `see also:` references
cannot find it with `rg '@anchor:auth-token-expiry'`. Add the prefix.

### 3. Cross-file references

A comment that points at another location whose behavior this code depends on
or mirrors. Must be specific enough for `rg` to find.

- Format: `// see also: <path>:<symbol-or-anchor>`.
- Path must be repo-relative; line numbers drift, prefer symbol or anchor.

```ts
// see also: src/auth/refresh.ts:rotateToken — must stay in sync with the
// expiry constant @anchor:auth-token-expiry.
```

✗ Near-miss (looks like a cross-file reference but is too vague):

```ts
// see auth.ts
```

No `see also:` keyword and no symbol or anchor — `rg` cannot disambiguate
which `auth.ts` (path) or which symbol inside it. Use the full
`// see also: <path>:<symbol-or-anchor>` shape.

### 4. Invariants

A statement of what must be true at this point — preconditions, postconditions,
ordering, or threading constraints — that the code itself cannot express.

- Phrase as a present-tense assertion, not a story.

```ts
// invariant: caller already holds the user-row transaction lock.
function bumpLoginCount(userId: string) { ... }
```

```python
# invariant: only called from the migration runner, never from a request handler.
def drop_legacy_index(): ...
```

✗ Near-miss (looks like an invariant but is history disguised as commentary):

```ts
// note: this used to be RSA
```

"Used to be" is the history pattern; the comment ages out the moment the
last reader who remembers RSA leaves. Restate as a present-tense invariant —
e.g. `// invariant: only Ed25519 keys are accepted; RSA is rejected at boot.`

### 5. Tool / compiler directives

Comments parsed by tooling — type checkers, linters, coverage, formatters.

- `// @ts-ignore`, `// @ts-expect-error`, `// eslint-disable-next-line`,
  `// biome-ignore lint/...`, `# noqa`, `# type: ignore`, `# pragma: no cover`,
  `// nolint`, `#[allow(...)]`, `// SAFETY: ...` (Rust unsafe-block reasoning).
- The reason after the directive should be a real reason, not "shut linter up".

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload
// shape is provider-defined and changes per release.
const payload: any = JSON.parse(raw);
```

✗ Near-miss (looks like a tool directive but is free-form English):

```ts
// disable lint here
const payload: any = JSON.parse(raw);
```

Linters do not parse plain English. Use the language's actual directive
shape — e.g. `// eslint-disable-next-line <rule> -- <real reason>` — and
include a real reason, not "shut linter up".

## Forbidden (6 categories)

Any comment that falls into these patterns should be deleted, rewritten as one
of the 5 allowed categories, or moved into a commit message / ticket.

### 1. What-comments (paraphrasing the code)

The code already says it. The comment adds no index value.

- Bad: `// 这里处理用户登录` above a function literally named `handleUserLogin`.
- Bad: `// loop over items` above `for (const item of items)`.
- Fix: delete it. If the function name does not say enough, rename the
  function instead.

### 2. History / change narrative

"What I just did" or "what it used to be". Lives forever, ages immediately.

- Bad: `// 之前是 RSA，现在改成 Ed25519`
- Bad: `// changed to use Map for O(1) lookup`
- Bad: `// 修复了 token 泄漏`
- Fix: put it in the commit message. If the previous behavior matters for the
  reader, restate it as an invariant — `// invariant: keys must be Ed25519;
  RSA keys are rejected at boot.` — which describes current truth, not history.

### 3. Task / ticket references (short-lived IDs)

`issue #123`, `PR #456`, `JIRA-789`, `ticket-1024`. The reference will outlive
the relevance of the link, and the link rots when the tracker moves.

- Bad: `// fix for issue #123`
- Bad: `// see PR #456 for context`
- Fix: pull the *content* of the issue into an invariant or anchor comment
  here, and keep the tracker link in the commit body. If the issue text is
  load-bearing for the reader, copy the conclusion in.

### 4. Tombstones (removed-code markers)

Comments describing code that is no longer there.

- Bad: `// removed: legacyValidate()`
- Bad: `// deleted old retry path`
- Bad: `// gone: deprecated handler`
- Fix: delete. Git history already keeps the removal. If something removed had
  a callable surface that other repos still import, that is a deprecation
  notice in package docs, not a tombstone in source.

### 5. Orphan TODOs

`TODO` without an owner, ticket, or precise condition that closes it.

- Bad: `// TODO 后面再处理`
- Bad: `// TODO: clean this up`
- Bad: `# FIXME later`
- Fix shape: `// TODO(@owner): <closing condition or ticket>`. Even better:
  open a real ticket and write an invariant comment explaining the current
  shortcut.
  - Allowed: `// TODO(@alice): drop fallback once auth-v3 ships in #ENG-204.`
  - Still bad: `// TODO: alice will fix later` (no closing condition).

### 6. Fix narratives

A specialized history comment — the comment exists to claim credit for a fix.

- Bad: `// fix: handle null user`
- Bad: `// fixed bug where the cache returned stale data`
- Fix: if the null-handling itself is non-obvious, use an invariant
  (`// invariant: user may be null when called from the unauthenticated
  preview route.`). Otherwise delete and let the test suite be the proof.

## Review Checklist

For each new or changed comment in the diff, ask:

1. Does it fall into one of the 5 allowed categories? Name which one.
2. Is the same information already implied by the function name, type, or
   nearby code?
3. Will this still be true in 6 months under normal churn?
4. If it's a TODO, does it have an owner and a closing condition?
5. If it cites another file, is the citation specific enough to grep?
6. If it's a tool directive, is the trailing reason a real reason?

If none of (1) holds, or (2) is yes, or (3) is no, or (4)/(5)/(6) fails — the
comment is rejected. Either rewrite or delete.

## Stop Conditions

Stop and return a finding instead of rewriting silently when:

- the comment asserts behavior that might be false and needs code evidence;
- the comment points to another file or symbol that cannot be found;
- deleting the comment would remove the only statement of an invariant;
- the right fix is a rename or code restructure owned by another slice.

## Anti-Pattern Detection (hook keywords)

The `comments-lint` hook scans newly-added comment lines for these keyword
families and emits a system-reminder when it hits anything. The hook is
advisory only — it never blocks the edit. The keyword set is intentionally
loose; precision is the reviewer's job.

Chinese narrative:
`修复` `修正` `修改了` `添加了` `新增了` `删除了` `去掉了` `之前是` `原来是` `改成`

English narrative:
`fixed` `added` `removed` `deleted` `previously` `used to` `changed to` `moved`

Task references:
`issue #` `pr #` `ticket #` `jira-`

Orphan TODOs:
`TODO` not followed by a `:` or `(@owner)`.

Tombstones:
`removed:` `deleted:` `gone:`

A hit does not automatically mean the comment is bad — `// changed to use
Map` is bad, but `// invariant: payload changed to v2 schema in 2024-04` is
fine. The hook flags; the reviewer (or the next edit pass) decides.

## Escape Hatch

When narrative truly is the right shape — for example, a top-of-file header
that has to record a non-obvious historical migration future readers need —
do one of:

1. Move it to a commit message or release note. That is what those are for.
2. Move it to a `CHANGELOG.md` entry. Tracker for history.
3. If it must live in source, mark it explicitly as historical context and
   keep it at file scope, not in-line:

   ```ts
   /**
    * Historical: this module replaced the v1 token store on 2024-04-12. The
    * v1 schema is documented in docs/auth/legacy.md; new readers do not need
    * to know about it.
    */
   ```

   This is allowed because it is a structured docstring (category 1) with a
   pointer (category 3) and is at file scope, not at every edit site.

4. Suppress the lint for one specific line when you are sure:
   `// comments-lint-allow: <reason>` on the same or previous line. Use this
   sparingly; it does not improve the comment, only mutes the warning.

## Output Shape

When the reviewer or the hook reports a finding, use this shape so it can flow
into `do-it-fix-loop`:

- `severity`: `Blocking` is reserved for comments asserting falsehoods (a
  stale invariant or a `see also:` pointer to a deleted symbol). Most are
  `Important` (narrative/tombstone/orphan-TODO that pollutes index value) or
  `Opportunity` (mild what-comment redundancy).
- `location`: file path + line.
- `category`: one of `what` / `history` / `task-ref` / `tombstone` /
  `orphan-todo` / `fix-narrative` / `stale-invariant` / `broken-reference`.
  This `category` field is the same slot that `do-it-review-loop`'s finding
  shape calls `cause class`; the names are interchangeable.
- `evidence`: the actual comment text and matched keyword(s).
- `suggested fix`: which of the 5 allowed shapes it should become, or
  `delete`.

Example finding:

```
- severity: Important
  location: src/auth/token.ts:42
  category: history
  evidence: "// 之前是 RSA，现在改成 Ed25519" (matched: 之前是, 改成)
  suggested fix: rewrite as invariant — "// invariant: only Ed25519 keys
  are accepted; RSA is rejected at boot."
```

## Verification

Before calling a comment pass clean:

- every changed comment is classified into one allowed category, or removed;
- every `see also:` target is greppable by path plus symbol or anchor;
- every TODO has an owner and closing condition;
- every tool directive uses the language/tool's actual directive syntax and a real reason;
- every flagged anti-pattern is fixed, explicitly allowed, or reported as a finding.

## Trigger Event

- **Pre-edit discipline**: when an edit will add TODOs, invariants, directives,
  cross-file references, anchors, or explanatory prose, load or apply this
  checklist before writing.
- **PostToolUse hook** (`comments-lint.sh`, registered with matcher
  `Edit|Write|MultiEdit`): runs after every code edit, scans the diff for
  newly-added comments matching the anti-pattern keywords, emits one
  system-reminder per file (not per line) pointing back at this skill. The
  hook never blocks the edit and is advisory only.
- **review-loop comments lens**: when `do-it-review-loop` runs at Standard or
  Heavy tier on a diff that includes comment changes, it loads this skill and
  walks the Review Checklist on every changed comment.

## Related Skills

- `do-it-review-loop` — invokes this skill for the comments lens during diff
  review.
- `do-it-fix-loop` — consumes findings produced by this skill's Output Shape.
- `do-it-context` — for terms that recur across files, consider promoting the
  shared definition into `.do-it/CONTEXT.md` instead of repeating an invariant
  comment in every caller.
