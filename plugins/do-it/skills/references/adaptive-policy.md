# Adaptive Policy v1

Personalized behavior is a compact delta over fixed do-it policy. It is not
memory, project truth, task state, a second core, or a place to store
incidents. Schema: `do-it/adaptive-profile/v1`. Cite `core §r-boundary` and
`core §r-verify` rather than restating those rules.

The interpreter is [`../do-it-adaptive/SKILL.md`](../do-it-adaptive/SKILL.md).
Validate with `node scripts/validate-adaptive-profile.mjs <file>`.

## Files

```text
~/.do-it/adaptive/profile.md                  # user-global
<repo>/.do-it/runtime/adaptive/profile.md     # user × project; local, gitignored
```

Project-local wins over global when both exist. Neither file is installed or
overwritten by the plugin. Missing file → no overlay.

Team rules stay in `AGENTS.md` / host instructions / handbook. They do not
belong in a personal profile.

## Precedence

```text
host/system safety
> current explicit user intent and action boundary
> current repository truth and durable instructions
> active task contract
> fixed Core
> project-local personal delta
> global personal delta
> specialist default
```

Adaptive may change a default tradeoff. It must not rewrite facts, store a
task or repo as policy, or weaken a higher source. Project-local cannot
override host, user intent, repo instructions, the active contract, or Core.

## Template

```markdown
---
schema: do-it/adaptive-profile/v1
---

## Active
- P001 [all] <one-line behavioral delta>
- P002 [review] <one-line behavioral delta>
```

Only `## Active` is injectable. Other headings, history, and rationale are
invalid in this file.

## Active contract

- 0–8 Active bullets.
- Stable unique `P###` ID (exactly three digits).
- One supported scope: `all`, `decide`, `build`, `architecture`, `review`,
  `verify`, `report`, or `delegation`.
- One sentence on one line; statement ≤ 120 characters.
- No task or project facts, paths, code, credentials, raw events, rationale,
  or Core restatement (`r-route` … `r-recovery`).
- No weakening of no-write, action boundaries, evidence honesty, or higher
  instructions.

## Mechanical reject

The validator and `adaptive-context.sh` may only reject what a script can
see. They skip the invalid entry (or refuse the file at authoring time) and
emit at most one bounded diagnostic. They must not claim to understand
semantic conflict with a contract or repo.

Reject / skip:

- more than 8 Active bullets (`oversize`)
- duplicate `P###` (`duplicate-id`)
- ID not `P` + three digits (`bad-id`)
- scope outside the supported set (`illegal-scope`)
- empty or >120-character statement (`empty` / `overlong`)
- Core rule IDs or explicit disable/weaken of Core, no-write, verify honesty,
  or authorization (`core-weaken`)
- paths, secrets, JSON/event payloads, code spans, `task_id` (`banned-content`)

Anything else that might fight Core, the contract, or repo truth is a
`do-it-adaptive` review, not a shell judgment.

## Injection

Runtime (`hooks/adaptive-context.sh`):

- missing profile → 0 tokens
- valid Active bullets only; no schema, headings, or commentary
- hash once per session; re-inject only when the winning file hash changes
- invalid entries skipped; one diagnostic for that hash
- child / subagent context does not receive the full profile; the parent
  passes at most the slice-relevant delta in the delegation prompt

## Lifecycle

```text
observation → candidate → shadow → active → stable → retired / reverted
```

- Explicit durable user preference: show the exact Active line, then activate
  after confirmation.
- Inferred lesson: at least two independent tasks plus a targeted eval before
  Active. One incident is not a rule.
- Counterexample on an Active trial: demote or mark review-needed.
- Explicit user preference is not auto-deleted for disuse.
- Prefer deleting an ineffective rule over adding exceptions.
- Never write Core, the TSV, or other fixed skills from this overlay.
  Core promotion needs maintainer review and cross-scenario evidence.

Candidates and the learning ledger are a later surface. This file holds only
Active deltas.
