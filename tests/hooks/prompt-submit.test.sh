#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
export DO_IT_HOOK_DATA="$TEMP/data"
unset PI_SUBAGENT_CHILD CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT KIMI_CODE_HOME KIMI_PLUGIN_ROOT CURSOR_PLUGIN_ROOT
payload='{"session_id":"prompt","prompt":"fix the helper"}'
printf '%s' "$payload" | DO_IT_ROUTER_MODE=legacy bash "$ROOT/hooks/prompt-submit.sh" | jq -e '.hookSpecificOutput.additionalContext | contains("causal owner")' >/dev/null
source "$ROOT/hooks/lib/common.sh"
first="$(do_it_user_turn_get prompt)"
printf '%s' "$payload" | bash "$ROOT/hooks/prompt-submit.sh" >/dev/null
second="$(do_it_user_turn_get prompt)"
[[ "$second" -gt "$first" ]]
echo 'prompt-submit: direct context delivery and edit-check turn isolation passed'
