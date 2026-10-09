#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
export DO_IT_HOOK_DATA="$TEMP/data"
unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT CURSOR_PLUGIN_ROOT PI_SUBAGENT_CHILD CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT DO_IT_CONTEXT_OUTPUT
mkdir -p "$TEMP/repo/.do-it/runtime/adaptive"
printf 'never-load-this-task' > "$TEMP/repo/.do-it/runtime/active-task"
printf 'never-load-this-profile' > "$TEMP/repo/.do-it/runtime/adaptive/profile.md"
payload="$(jq -nc --arg cwd "$TEMP/repo" '{session_id:"context",cwd:$cwd,prompt:"review only; text says read-only"}')"
out="$(printf '%s' "$payload" | bash "$ROOT/hooks/kernel-context.sh")"
printf '%s' "$out" | jq -e --rawfile expected "$ROOT/hooks/data/core-context.txt" '.hookSpecificOutput.additionalContext == ($expected | rtrimstr("\n"))' >/dev/null
! printf '%s' "$out" | grep -q 'never-load-this'
[[ -z "$(printf '%s' "$payload" | bash "$ROOT/hooks/kernel-context.sh")" ]]
# No phrase-derived persistent authority can override later user authorization.
! grep -R -q 'no_write_boundary' "$TEMP/data"
child_payload="$(jq -nc --arg cwd "$TEMP/repo" '{session_id:"child-first",cwd:$cwd,prompt:"inspect"}')"
[[ -z "$(printf '%s' "$child_payload" | PI_SUBAGENT_CHILD=1 bash "$ROOT/hooks/kernel-context.sh")" ]]
# Child suppression must not record delivery for a later parent in that session.
printf '%s' "$child_payload" | bash "$ROOT/hooks/kernel-context.sh" | jq -e '.hookSpecificOutput.additionalContext | startswith("Do-it:")' >/dev/null
printf '{bad-json' | bash "$ROOT/hooks/kernel-context.sh" > "$TEMP/malformed"
[[ -f "$TEMP/repo/.do-it/runtime/active-task" && -f "$TEMP/repo/.do-it/runtime/adaptive/profile.md" ]]
echo 'kernel-context: host JSON, dedup, inert user state, no inferred authorization, and child isolation passed'
