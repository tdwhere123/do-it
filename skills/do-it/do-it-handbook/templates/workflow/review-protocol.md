# Review Protocol

Review mode, severity, and evidence expectations.
`do-it-review-loop` is the agent-side counterpart of this document.

## Review Modes

- **Self-review** — the implementer re-reads the diff against the
  task card §4 acceptance criteria before requesting review.
- **PR-style review** — `reviewer` agent (or a peer) checks the diff
  against acceptance criteria, invariants, and contract surface.
- **Multi-perspective review** — additional read-only review agents
  (`architect-reviewer`, `red-team-reviewer`, `domain-language-reviewer`,
  etc.) run when their lens is needed.

The default for a Standard-tier task is self-review. Add PR-style review when
the task has a named non-local risk, an interface/module boundary, or an
explicit review/subagent request. Heavy tier adds multi-perspective review.

## Severity

- **Blocking** — must resolve before merge. Correctness, contract,
  invariants, or unsafe state.
- **Important** — should resolve now. Avoidable rework, review
  failure, unclear ownership, or significant maintenance debt.
- **Opportunity** — useful improvement; not a blocker.

A finding carries exactly one severity. Re-classifying a Blocking
finding as Important is a discussion, not a unilateral move.

## Evidence Requirements

Every finding must cite evidence. Acceptable forms:

- `path:line` reference.
- A grep / rg snippet showing the contradicted assumption.
- A failing test command and its output.
- A schema or contract diff.

Unacceptable evidence:

- "It feels wrong."
- "I think this could be a problem."
- "In my experience, ...".

If a reviewer cannot cite evidence, the finding is downgraded to a
question for the implementer, not a Blocking item.

## Fix Loop

1. Address each Blocking and Important finding atomically.
2. After fixes, **re-run review on the same scope**. Spot-fixes
   without a re-review let partial fixes ship.
3. Repeat until Blocking and Important are empty.
4. Opportunity findings may merge with the change or get filed as
   backlog issues; do not block on them.

## Closeout

A card is done when:

- All §4 acceptance criteria pass with the §5 verification commands.
- All Blocking and Important review findings are resolved.
- Fresh verification evidence is recorded on the integrated branch
  (not just the worktree).
- `runtime-status.md` and `code-map.md` are updated if implementation
  shape changed.
- The closeout states which brainstorm, grill, subagent, review, and
  verification steps were used or skipped, with the reason when the route made
  them relevant.

## Anti-Patterns

- "DONE" claims without verification output. `do-it-verification-gate`
  catches this; do not weaken the gate.
- Reviewers asking the implementer to fix Blocking findings while
  approving the PR. Approval after Blocking findings is a process
  failure.
- Reviewers re-litigating architecture invariants in PR comments.
  Invariant changes go through a task card, not a review thread.
