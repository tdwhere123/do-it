# Write-Quality Families

Closed-set registry for `hooks/write-quality-lint.sh` (L0 advisory). Scans
**newly-added lines only**, emits at most one reminder per file per user turn.
Authoritative machine list: [`hooks/data/quality-families.tsv`](../../../hooks/data/quality-families.tsv).
Code Quality (`do-it-code-quality`) references this registry through its causal
change guidance for comment and file-size families; thresholds stay here.

## How to use findings

The hook offers local signals. A model or independent reviewer assesses their
relevance to the actual change; an advisory is neither a verdict nor proof.

Suppress one advisory family with `write-quality-lint-allow: <family-id> — <reason>` on an added line. `secret-leak` is never suppressible.

## Families

### Comments

| ID | Detects |
|---|---|
| `narrative-comment` | Change/fix/tracker narrative in comments (merged former history/fix-narrative/task-ref) |
| `orphan-todo` | `TODO`/`FIXME`/`XXX` without `:` or `(@owner)` |
| `tombstone` | `removed:` / `deleted:` / `gone:` |

### Anti-patterns

| ID | Detects |
|---|---|
| `case-list` | ≥15 consecutive bash `case` branch patterns |
| `no-consumer` | New JS/TS export with no other-file consumer |
| `copy-paste` | ≥5-line block duplicated in same directory |

### Integrity

| ID | Detects |
|---|---|
| `swallow-error` | Empty catch / `except: pass` |
| `test-weakened` | skip/xfail/only markers |
| `secret-leak` | Likely credentials / private keys |

### Maintainability / slicing

| ID | Detects |
|---|---|
| `debug-leftover` | console/debugger/print outside tests |
| `edit-bloat` | Single edit adds >120 lines (`DO_IT_EDIT_BLOAT_LINES`) |
| `file-size` | File over size limit — warn >500 lines, split ≥800 (wc -l semantics). Precedence: `DO_IT_FILE_SIZE_WARN_LINES` / `DO_IT_FILE_SIZE_SPLIT_LINES` env > `.do-it/write-quality.local.tsv` at the git root of the edited file (`file-size-warn` / `file-size-split` rows) > defaults |

### Metacognition (local → global without whole-repo reads)

| ID | Detects / nudge |
|---|---|
| `scope-chain` | Non-local/interface-risk edit — identify the next missing premise, consumer, or bounded proof path ([scope-chain.md](scope-chain.md)) |
| `live-path` | Handler-like export with no other-file caller |
| `type-escape` | `as any` / `@ts-ignore` / `as unknown as` — bypassing contracts? |
| `test-fiction` | ≥3 mock helpers in one edit — real contract or fiction? |

## Edit surface gating

| Edit surface | Hook runs when |
|---|---|
| Applicable source edit | Scan newly added lines, regardless of task labels |

Subagent context: skipped.
