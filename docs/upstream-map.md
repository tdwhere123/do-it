# Origin And Rewrite Map

Imported on `2026-04-12`. Unified rewrite completed on `2026-04-12`.
Live global rebaseline imported on `2026-04-24`.

These directories are maintained in this repository as install-stable,
repo-managed workflow entries. The `2026-04-24` rebaseline intentionally copied
the current global `~/.codex/skills` and `~/.codex/agents` entries back into the
repo so the next rewrite starts from the actual live behavior. Legacy
`superpowers` terminology and restored support files are known cleanup targets.

## Skills

| Skill | Source Family | Imported From | Notes |
|---|---|---|---|
| `using-superpowers` | superpowers | `~/.codex/skills/using-superpowers` | Live global snapshot. Keeps entrypoint discipline but still carries legacy naming and platform-reference support files. |
| `brainstorming` | superpowers | `~/.codex/skills/brainstorming` | Live global snapshot. Includes restored support files that should be re-evaluated during the semantic cleanup. |
| `quality-workflow-router` | local codex | `~/.codex/skills/quality-workflow-router` | Repo-first router retained and tightened around current task/wave/phase policy. |
| `decision-first-brainstorming` | local codex | `~/.codex/skills/decision-first-brainstorming` | Repo-first planning adapter retained and simplified. |
| `agentic-tdd-execution` | local codex | `~/.codex/skills/agentic-tdd-execution` | Repo-first implementation workflow retained and aligned with current Codex constraints. |
| `multi-perspective-review` | local codex | `~/.codex/skills/multi-perspective-review` | Repo-first review router retained with clarified reviewer-stack sizing. |
| `verification-before-completion` | superpowers | `~/.codex/skills/verification-before-completion` | Live global snapshot. Evidence-first rule retained; wording still needs repo-first cleanup. |
| `finishing-a-development-branch` | superpowers | `~/.codex/skills/finishing-a-development-branch` | Live global snapshot. Branch closeout flow retained; exact closeout policy should be rechecked in the rewrite. |
| `requesting-code-review` | superpowers | `~/.codex/skills/requesting-code-review` | Live global snapshot. Includes restored reviewer prompt support. |
| `receiving-code-review` | superpowers | `~/.codex/skills/receiving-code-review` | Live global snapshot. Keeps technical skepticism; wording still needs repo-first cleanup. |
| `systematic-debugging` | superpowers | `~/.codex/skills/systematic-debugging` | Live global snapshot. Includes restored debugging support references. |
| `test-driven-development` | superpowers | `~/.codex/skills/test-driven-development` | Live global snapshot. Includes restored anti-pattern reference. |
| `using-git-worktrees` | superpowers | `~/.codex/skills/using-git-worktrees` | Live global snapshot. Isolation workflow retained; mandatory-worktree assumptions need cleanup review. |
| `subagent-driven-development` | superpowers | `~/.codex/skills/subagent-driven-development` | Live global snapshot. Includes restored prompt-template support files. |
| `writing-plans` | superpowers | `~/.codex/skills/writing-plans` | Live global snapshot. Includes restored plan-review prompt support. |

## Agents

| Agent | Imported From | Notes |
|---|---|---|
| `architect-reviewer` | `~/.codex/agents/architect-reviewer.toml` | Portable at import time. |
| `code-mapper` | `~/.codex/agents/code-mapper.toml` | Portable at import time. |
| `code-quality-cleaner` | `~/.codex/agents/code-quality-cleaner.toml` | Portable at import time. |
| `documentation-engineer` | `~/.codex/agents/documentation-engineer.toml` | Portable at import time. |
| `plan-challenger` | `~/.codex/agents/plan-challenger.toml` | Portable at import time. |
| `react-specialist` | `~/.codex/agents/react-specialist.toml` | Portable at import time. |
| `red-team-reviewer` | `~/.codex/agents/red-team-reviewer.toml` | Portable at import time. |
| `reviewer` | `~/.codex/agents/reviewer.toml` | Portable at import time. |
| `sql-pro` | `~/.codex/agents/sql-pro.toml` | Portable at import time. |
| `spec-compliance-reviewer` | repo-authored | Added locally for task and plan conformance review. |
| `test-automator` | `~/.codex/agents/test-automator.toml` | Portable at import time. |
| `tdd-red-writer` | repo-authored | Added locally for RED-only test authoring. |
| `typescript-pro` | `~/.codex/agents/typescript-pro.toml` | Portable at import time. |
