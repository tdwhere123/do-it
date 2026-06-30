# Write-Quality Families

Closed-set registry for `hooks/write-quality-lint.sh` (L0 advisory). The hook
scans **newly-added lines only**, emits at most one reminder per file per user
turn, and lists matched family IDs — load this file when you need regex detail
or review guidance (L3 progressive disclosure).

Authoritative machine list: [`hooks/data/quality-families.tsv`](../../../hooks/data/quality-families.tsv).
New families require TSV + test + this doc — no ad-hoc hook growth.

## Enforcement Ladder Context

| Layer | Role |
|---|---|
| L0 | This hook — advisory reminder |
| L1 | `do-it-review-loop` — YAGNI / comments / integrity lenses must respond to flagged families |
| L2 | `verification-gate` — hard block on unsubstantiated done claims |
| L3 | `do-it-branch-closeout` — merge evidence rollup |

## Suppress Syntax

Skip the hook for the current file edit when any **added line** contains:

```
write-quality-lint-allow: <reason>
```

Legacy aliases (still honored):

```
comments-lint-allow: <reason>
anti-patterns-lint-allow: <reason>
```

Use sparingly — a suppress without review response is a review finding.

## Families

### Comments (load `do-it-comments-discipline` for allowed shapes)

| ID | Category | Detects | Review lens |
|---|---|---|---|
| `history` | comments | Change narrative (`修改了`, `之前是`, `added`, `changed to`, bare `removed`/`deleted` without `:`) | comments |
| `fix-narrative` | comments | Fix/bug narrative (`修复`, `fixed`, `fix:`, `hotfix`) | comments |
| `task-ref` | comments | External tracker (`issue #`, `pr #`, `jira-`, `phase N`, `wave N`) | comments |
| `orphan-todo` | comments | `TODO`/`FIXME`/`XXX` without `:` or `(@owner)` | comments |
| `tombstone` | comments | `removed:`, `deleted:`, `gone:` | comments |
| `what-comment` | comments | Comments that restate obvious code (heuristic) | comments |

### Anti-Patterns / YAGNI

| ID | Category | Detects | Review lens |
|---|---|---|---|
| `case-list` | anti-pattern | ≥10 consecutive bash `case` branch patterns in one edit | YAGNI / codebase-design |
| `no-consumer` | anti-pattern | New JS/TS export with no other-file consumer in repo | YAGNI (`delete:` / `yagni:`) |
| `copy-paste` | anti-pattern | ≥5-line block duplicated against neighbor in same directory | YAGNI (`shrink:`) |

### Integrity

| ID | Category | Detects | Review lens |
|---|---|---|---|
| `swallow-error` | integrity | Empty `catch`, `except: pass`, no-op `.catch(() => {})` | Integrity / debugging |
| `test-weakened` | integrity | New `skip`/`xit`/`xtest`/`@pytest.mark.skip`/`it.skip` | Integrity |

See [`integrity.md`](integrity.md).

### Maintainability

| ID | Category | Detects | Review lens |
|---|---|---|---|
| `debug-leftover` | maintainability | `console.log`/`debugger`/`print(` outside `*test*` paths | maintainability |

### Slicing

| ID | Category | Detects | Review lens |
|---|---|---|---|
| `edit-bloat` | slicing | Single edit adds >80 lines (override: `DO_IT_EDIT_BLOAT_LINES`) | slicing / YAGNI |

## Tier / DIM Gating

| Tier | Hook runs when |
|---|---|
| Light | never |
| Standard | `dim_touches_code=1` OR ≥5 added lines |
| Heavy | always (still advisory) |

Subagent context: skipped entirely.

## Review-Loop Contract

When L0 flagged families for files in the diff, `do-it-review-loop` YAGNI and
comments lenses MUST either:

- emit a finding referencing the family and evidence line, or
- record an explicit rebuttal ("family X flagged but acceptable because …") in
  the review output.

Silent ignore of a flagged family is an Important review finding.

## Hook Reminder Shape

```
do-it write-quality-lint (advisory): edit on <path> matched <families>.
Suppress per edit with write-quality-lint-allow (legacy: comments-lint-allow, anti-patterns-lint-allow).
Review flagged families before declaring done.
```
