---
name: do-it-worktree-isolation
description: "Problem: parallel high-risk work corrupts the main checkout, mixes unrelated changes, or makes rollback impossible when something goes wrong. Fix: run risky or long work inside an isolated git worktree until it is ready to integrate."
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

## Handoff Shape

- worktree path and branch;
- base ref;
- allowed and forbidden paths;
- bootstrap/baseline result;
- cleanup expectation.
