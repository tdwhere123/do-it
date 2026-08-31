---
name: do-it-adaptive
description: "Use when inspecting, proposing, testing, activating, reverting, or explaining personalized do-it behavior deltas; the fixed skill interprets bounded profiles and never self-modifies the core."
---

# Do-It Adaptive

Fixed interpreter for a short, governed behavior overlay. The skill does not
change. What may change is the local profile. Schema, budget, and mechanical
rejects: [`../references/adaptive-policy.md`](../references/adaptive-policy.md).

Adaptive is a delta over fixed do-it behavior, not memory, CONTEXT, a task
contract, or a second core.
<!-- do-it-contract:adaptive.delta-only -->
Never edit `do-it-core`, the Core TSV, or other fixed skills from this
workflow (`core §r-scope`, `core §r-boundary`).
<!-- do-it-contract:adaptive.no-core-writes -->

## When To Use

- Inspect which Active deltas apply, and whether a candidate would be legal.
- Activate, demote, or revert a personal preference the user asked to persist.
- Explain a conflict with Core, no-write, repo instructions, or the active
  contract ([`../references/task-contract.md`](../references/task-contract.md)).
- Review whether a rule should be deleted instead of growing exceptions.

Do not use this skill to store project facts, paths, secrets, transcripts, or
task progress. Those belong in repo docs, CONTEXT, the contract, or chat.

## Sources
<!-- do-it-contract:adaptive.precedence-vs-core -->

- Global: `~/.do-it/adaptive/profile.md`
- Project-local personal: `<repo>/.do-it/runtime/adaptive/profile.md`

Project-local wins over global. Ladder: host/system safety → current
explicit user intent and action boundary → repository truth/instructions →
active task contract → project-local personal delta → global personal
delta → specialist defaults. Core (honesty, boundary, evidence, no-write)
constrains every rung; a contract or adaptive delta cannot waive it.

## Apply Active Deltas

1. Read the winning profile. Missing file → no overlay (0 tokens).
2. Use only `## Active` bullets that pass the contract (unique `P###`, one
   supported scope, one bounded line). Cap is 0–8 Active bullets.
   <!-- do-it-contract:adaptive.active-cap -->
3. Treat each bullet as a default tradeoff inside its scope. If it collides
   with a higher source, skip it and say so; do not rewrite Core or the
   contract to make it fit.
4. Child work does not load the full profile. Pass at most the one delta that
   applies to the delegated slice.
   <!-- do-it-contract:adaptive.child-one-delta -->
5. Do not invent extra rules from a single incident, a hook silence, or a
   specialist default.

## Light — Inspect

Report winning path (global vs project-local), Active IDs and scopes, skipped
mechanical reasons if known, and that Core / no-write / contract still bind.
Do not edit the profile.

## Standard — Propose, Activate, Revert

1. Show the exact proposed Active line (ID, scope, statement).
2. Check [`adaptive-policy.md`](../references/adaptive-policy.md): budget,
   uniqueness, scope, banned content, Core-weaken.
3. Ask one confirmation before writing. Do not write Core or other skills.
4. Revert by removing or replacing that ID; keep the rest.

Heavy Core-promotion talk is parent-only and still cannot write Core.

## Lifecycle

observation → candidate → shadow → active → stable → retired/reverted

Explicit durable preference may become Active after the exact wording is
shown and confirmed. Inferred lessons need independent task support and a
targeted eval. Counterexample demotes. Prefer deletion over exception piles.

## Stop

- The requested delta weakens Core, no-write, evidence honesty, or a higher
  source (`core §r-boundary`, `core §r-verify`).
- The text is a task fact, path, secret, event, or Core restatement.
- Active would exceed 8 bullets or reuse an ID.
- The user has not confirmed the exact line.
- Promotion into a fixed skill is requested — report the gap; do not patch
  shipped skills.

## Anti-skip

- *"The profile is personal, so it outranks the contract."* — It does not.
- *"Silence from the hook means the delta is in Core now."* — Hooks inject
  Active text; they never graduate a rule (`core §r-evidence`).
- *"I should copy a Core sentence so the model does not forget."* — Copying
  Core is invalid; cite `core §<rule_id>`.
- *"A child should inherit the whole profile."* — Pass one relevant delta.

## Red Flags

- Profile holds incidents, paths, credentials, or project architecture.
- An Active line tells the agent to skip verify, no-write, or confirmation.
- This skill or a hook is used to edit `do-it-core` or the TSV.
- More than 8 Active bullets, duplicate IDs, or illegal scopes.

## Verification

Before claiming a profile applies: winning file (or missing → none); Active
IDs injected; IDs skipped and why; confirmation that Core, action boundary,
and the active contract still hold; no Core files changed.
