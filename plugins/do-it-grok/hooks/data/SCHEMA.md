# Hook Data

Project overrides are data-only, never sourced as shell.

## `quality-families.tsv` format

```
<family-id><TAB><lens><TAB><description>
```

- `<family-id>` is the stable identifier emitted in hook reminders and usable as a `do-it-review` lens.
- `<lens>` names the review lens that must respond when the family fires (e.g. `comments`, `yagni`, `integrity`).
- `<description>` is a short human note; detection logic lives in `hooks/lib/write-quality-scan.sh`, not in the tsv.
- Lines beginning with `#` are comments. Blank lines are ignored.
- New families require a tsv row, scan logic, a test case, and a row in `skills/do-it/references/write-quality-families.md`.

## Write-quality limits

`<git-root of the edited file>/.do-it/write-quality.local.tsv` overrides
numeric limits for `write-quality-lint.sh`. File-size is a repo-shape limit, so the file lives beside the code it governs: hooks read it line by line and never source it.
One `key<TAB>value` row per line; `#` comments and blank lines ignored; CRLF
tolerated; a non-numeric value discards only its own level.

```text
file-size-warn	600
file-size-split	1000
```

Known keys: `file-size-warn` (default 500), `file-size-split` (default 800).
Environment variables `DO_IT_FILE_SIZE_WARN_LINES` /
`DO_IT_FILE_SIZE_SPLIT_LINES` take precedence over this file.
