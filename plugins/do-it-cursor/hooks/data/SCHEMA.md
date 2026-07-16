# `hooks/data/` keyword tables

This directory holds the data-driven keyword tables consumed by `hooks/lib/keywords.sh`. Editing the tsv files is the supported way to tune `do-it` triggering behavior — you should not need to touch shell code for word changes.

## File list

| File | Used by | Effect when matched |
|---|---|---|
| `intent-verbs.tsv` | `router.sh` | Contribute to direct work classification when paired with a concrete code object; does not trigger grill by itself |
| `uncertainty-words.tsv` | compatibility loader only | Currently inert; retained so existing data-only project overrides remain parseable |
| `heavy-signals.tsv` | `router.sh` | Contribute to Heavy tier; two topical signals or one action-shaped release/security/migration signal promote to Heavy |
| `light-signals.tsv` | `router.sh` | Cap at Light tier (with short input) |
| `escape-words.tsv` | All hooks | Set skip flags for this turn |
| `long-input-hints.tsv` | compatibility loader only | Currently inert; input length never triggers a grill reminder |
| `question-hints.tsv` | `router.sh` | Recognize likely informational prompts; direct task, delegation, and high-consequence action intent still wins |
| `quality-families.tsv` | `hooks/lib/write-quality-scan.sh` | Closed-set advisory family registry for `write-quality-lint.sh` (L0); not prompt-keyword driven |

## `quality-families.tsv` format

```
<family-id><TAB><lens><TAB><description>
```

- `<family-id>` is the stable identifier emitted in hook reminders and usable as a `do-it-review` lens.
- `<lens>` names the review lens that must respond when the family fires (e.g. `comments`, `yagni`, `integrity`).
- `<description>` is a short human note; detection logic lives in `hooks/lib/write-quality-scan.sh`, not in the tsv.
- Lines beginning with `#` are comments. Blank lines are ignored.
- New families require a tsv row, scan logic, a test case, and a row in `skills/do-it/references/write-quality-families.md`.

## Line format

```
<term><TAB><flags>
```

- `<term>` is the literal text matched against the lower-cased prompt. It may contain spaces (e.g. `breaking change`).
- `<flags>` is an optional comma-separated list. The TAB is required only when flags are present; bare-term lines are allowed.
- Lines beginning with `#` are comments. Blank lines are ignored.

## Recognised flags

| Flag | Effect |
|---|---|
| `leading-ws` | Prepend a single space to the term before matching. Kept only for legacy project overrides; the shipped tables should not need it because ASCII terms get word-boundary matching automatically. |
| `trailing-ws` | Append a single space to the term before matching. Same caveat as `leading-ws`. |

> **0.5.0 note.** ASCII terms are matched with `grep -wF` (word-boundary) automatically — no flag needed for that case. Single-character CJK terms are intentionally absent from the shipped tables to suppress over-firing; if you must add one in your project override, use `.do-it/keywords.local.tsv` and accept the substring semantics.

## Why two columns instead of one

The Write workflow (and many editors) silently strip trailing whitespace, which would corrupt a single-column entry like `add ` (with significant trailing space). Two columns make the whitespace declarative and survive trips through editors / lints / diff tools.

## Maintenance checklist

When adding a term, ask:

1. Does this CJK term over-fire on neighbouring characters? (e.g., `修` matches `修订`, `修复`, `修改`.) If yes — make it ≥2 chars (`修改`, `修复`) and let `修` go.
2. Does this ASCII term need a word boundary? It already gets one automatically through `grep -wF`; do not add whitespace-padded duplicates to the shipped tables.
3. Is the term in the right table? Heavy signals are reserved for changes that span packages / public interfaces / migrations.
4. Will it cause `address` / `prefix` / `released` style false positives? If unsure, write a quick smoke prompt and run `DO_IT_DEBUG=1 echo '{"prompt":"...","session_id":"smoke","cwd":"'"$PWD"'"}' | bash hooks/router.sh 2>&1`.

## Project-level overrides

`<cwd>/.do-it/keywords.local.tsv` is parsed after the shipped tables are loaded. It is data-only: hooks never source or evaluate project configuration. Each row names a known table, then a literal term, then optional flags:

```text
intent-verbs	微调
intent-verbs	审稿
heavy-signals	cutover	trailing-ws
```

Allowed table names are `intent-verbs`, `uncertainty-words`, `heavy-signals`, `light-signals`, `escape-words`, `long-input-hints`, `question-hints`, and `intent-objects`. Only the flags listed above are accepted. Unknown tables or flags, empty terms, and extra columns are ignored with a warning. Legacy `.do-it/keywords.local.sh` files are inert and produce a migration warning.

Removing terms from the defaults is intentionally not supported through the local override — fork the tsv into your project if that's needed.
