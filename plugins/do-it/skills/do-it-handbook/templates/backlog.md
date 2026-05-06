# Backlog

Cross-cutting unresolved issues only. Scheduled work keeps detailed
acceptance criteria in the owning task card or PR.

## Issue Numbering

Issues are numbered `#BL-001`, `#BL-002`, ... in plain decimal
sequence. **Next available number**: `#BL-001`.

Rules:

- Each issue has an explicit close condition. If you cannot write the
  close condition, the issue is not ready for backlog and probably
  belongs in the originating task card.
- Each issue names its opener (which card / wave / review surfaced
  it).
- Closing an issue requires citing the change (PR or commit) that
  satisfied the close condition.

## Open Issues

> Template for new entries:

```markdown
### #BL-NNN — <One-line title>

**Opened by**: <task-card or review or session>

**Symptom**: <what is wrong, observed concretely — file paths and
line numbers when relevant>.

**Close condition**: <a single, verifiable artifact or test that
proves the issue is resolved>.

**Notes**: <optional: contributing factors, attempted fixes,
related issues>.
```

(none open yet)

## Closed Issues

(none closed yet)

## Conventions

- Do not delete closed issues; move them to the "Closed" section with
  the closing reference. The history is the value.
- Do not open an issue you would not be willing to close yourself or
  hand to a named owner.
- A `deferred to backlog` line in a task card MUST cite an issue
  number from this file.
