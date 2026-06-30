---
name: do-it-worktree-isolation
description: "Use when risky, long, or parallel work needs an isolated git worktree to protect the main checkout and simplify rollback."
---

# Do-It Worktree Isolation

## Purpose

Use this to protect user and peer edits while giving implementation lanes a
clean workspace.

## Tiers

### Light

Use no new worktree when the current workspace is clean enough, the edit is
tiny, and ownership is explicit. Still check status before editing.

### Standard

Use for normal feature or bugfix work when the current worktree is dirty,
parallel agents are active, or baseline truth should be preserved.

1. Check current branch and status.
2. Pick the existing project worktree directory if one exists.
3. Verify project-local worktree directories are ignored before use.
4. Create a branch/worktree from the intended base.
5. Run required dependency bootstrap or baseline checks when the repo needs them.
6. Work only inside the lane and report the path.

Subagents default to Standard and should receive the exact worktree path and
write ownership.

### Heavy

Use for multi-lane, wave, phase, or integration-controller work. Heavy is
parent-only unless explicitly assigned.

- Use one controller/integration worktree plus lane worktrees when shared files need a single owner.
- Keep shared docs, manifests, package files, and closeout commits under the controller unless assigned.
- Define merge order, conflict policy, and verification before dispatching lanes.
- Remove only task-owned worktrees and branches when cleanup is explicitly in scope.

## Safety Rules

- Never overwrite unrelated dirty files to get a clean start.
- Do not delete a worktree or branch unless the user requested cleanup or chose that closeout option.
- Do not assume the base branch; verify it or state the assumption.
- If baseline checks fail, report the failure before implementation claims.
- If setup needs network or privileged access and fails, request approval through the normal tool flow.

## Stop Conditions

Stop before creating, editing, merging, or cleaning a worktree when:

- the intended base ref is unknown or stale and cannot be verified;
- existing dirty files overlap the task-owned paths;
- the worktree path is not ignored or would land inside another active lane;
- cleanup would remove work not proven merged, pushed, or intentionally discarded.

## Common Rationalizations

- *"I'll just edit main because it is faster."* — Use the current checkout only
  when risk, dirtiness, and parallelism are low enough for Light.
- *"The branch name makes the base obvious."* — Base truth comes from git, not
  naming convention.
- *"Cleanup is harmless after tests pass."* — Cleanup depends on merge/discard
  state, not test status.

## Red Flags

- Worktree is created from a guessed base or old local branch.
- Multiple lanes can mutate the same generated output or manifest.
- Final answer omits worktree path, branch, or cleanup state.
- `git status` was never checked before edits or before closeout.

## Verification

Before claiming isolation is ready or cleaned:

- branch, path, and base ref are recorded;
- status was checked in both source and lane when relevant;
- ignored/allowed path assumptions are verified;
- cleanup names exactly which task-owned worktrees or branches were removed or retained.

## Handoff Shape

- worktree path and branch;
- base ref;
- allowed and forbidden paths;
- bootstrap/baseline result;
- cleanup expectation.
