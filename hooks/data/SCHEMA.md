# `hooks/data/` keyword tables

This directory holds the data-driven keyword tables consumed by `hooks/lib/keywords.sh`. Editing the tsv files is the supported way to tune `do-it` triggering behavior — you should not need to touch shell code for word changes.

## File list

| File | Used by | Effect when matched |
|---|---|---|
| `intent-verbs.tsv` | `router.sh`, `grill-prompt.sh` | Promote to Standard tier; trigger grill |
| `uncertainty-words.tsv` | `grill-prompt.sh` | Trigger grill #2 (premise pressure-test) |
| `heavy-signals.tsv` | `router.sh` | Promote to Heavy tier |
| `light-signals.tsv` | `router.sh` | Cap at Light tier (with short input) |
| `escape-words.tsv` | All hooks | Set skip flags for this turn |
| `long-input-hints.tsv` | `grill-prompt.sh` | Trigger grill #3 when input is long + topical |
| `question-hints.tsv` | `router.sh`, `grill-prompt.sh` | Phase 1+: cap at Light, suppress grill |

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
| `leading-ws` | Prepend a single space to the term before matching. Useful for legacy substring overrides; rarely needed in 0.5.0+ since ASCII terms get word-boundary matching automatically. |
| `trailing-ws` | Append a single space to the term before matching. Same caveat as `leading-ws`. |

> **0.5.0 note.** ASCII terms are matched with `grep -wF` (word-boundary) automatically — no flag needed for that case. Single-character CJK terms are intentionally absent from the shipped tables to suppress over-firing; if you must add one in your project override, do it in `.do-it/keywords.local.sh` and accept the substring semantics.

## Why two columns instead of one

The Write workflow (and many editors) silently strip trailing whitespace, which would corrupt a single-column entry like `add ` (with significant trailing space). Two columns make the whitespace declarative and survive trips through editors / lints / diff tools.

## Maintenance checklist

When adding a term, ask:

1. Does this CJK term over-fire on neighbouring characters? (e.g., `修` matches `修订`, `修复`, `修改`.) If yes — make it ≥2 chars (`修改`, `修复`) and let `修` go.
2. Does this ASCII term need a word boundary? (e.g., `fix` matches `prefix`.) Add `leading-ws,trailing-ws` for the temporary fix; once Phase 1 ships, switch to the `wb` flag.
3. Is the term in the right table? Heavy signals are reserved for changes that span packages / public interfaces / migrations.
4. Will it cause `address` / `prefix` / `released` style false positives? If unsure, write a quick smoke prompt and run `DO_IT_DEBUG=1 echo '{"prompt":"...","session_id":"smoke","cwd":"'"$PWD"'"}' | bash hooks/router.sh 2>&1` (Phase 6 lands the structured debug output).

## Project-level overrides

`<cwd>/.do-it/keywords.local.sh` is sourced after the tsv tables are loaded. Use it to append project-specific words:

```bash
# .do-it/keywords.local.sh
DO_IT_INTENT_VERBS+=("微调" "审稿")
```

Removing terms from the defaults is intentionally not supported through the local override — fork the tsv into your project if that's needed.
