#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
#
# Claim-integrity guard: after edits, completion language needs fresh, relevant
# current-turn evidence. It does not require a named skill, plan, review marker,
# or arbitrary ceremony. `NOT_VERIFIED` is always an honest alternative.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
STOP_HOOK_ACTIVE="$(do_it_json_get "$RAW_INPUT" stop_hook_active)"

do_it_session_state_inc "$SESSION_ID" hook_invocations verification_gate

_gate_finish() {
  do_it_clear_skip "$SESSION_ID"
  exit "${1:-0}"
}

if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  do_it_debug verification-gate "decision=skip-recursion"
  _gate_finish 0
fi

if do_it_check_skip "$SESSION_ID" gate; then
  do_it_debug verification-gate "decision=skip-flag"
  _gate_finish 0
fi

LAST_PROMPT_KIND="$(do_it_session_state_get "$SESSION_ID" last_prompt_kind)"
GRILLED_FLAG="$(do_it_session_state_get "$SESSION_ID" grilled)"
if [[ "$LAST_PROMPT_KIND" == "question" ]] || [[ -z "$LAST_PROMPT_KIND" && "$GRILLED_FLAG" == "skip-question" ]]; then
  do_it_debug verification-gate "decision=skip-question"
  _gate_finish 0
fi

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  do_it_debug verification-gate "decision=skip-no-transcript"
  _gate_finish 0
fi

TAIL_BUF="$(tail -n 400 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
[[ -z "$TAIL_BUF" ]] && _gate_finish 0

LAST_ASSISTANT_TEXT=""
if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" \
    | jq -rs 'map(select(.type=="assistant")) | last | (.message.content // []) | map(select(.type=="text") | .text) | join("\n")' 2>/dev/null || true)"
fi
[[ -z "$LAST_ASSISTANT_TEXT" ]] && LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" | tail -n 5)"

CURRENT_TURN_BUF="$TAIL_BUF"
_last_user_line="$(printf '%s\n' "$TAIL_BUF" | grep -nE '"(type|role)"[[:space:]]*:[[:space:]]*"user"' | tail -n1 | cut -d: -f1)"
case "$_last_user_line" in
  ''|*[!0-9]*) ;;
  *) CURRENT_TURN_BUF="$(printf '%s\n' "$TAIL_BUF" | tail -n +"$((_last_user_line + 1))")" ;;
esac

COMPLETION_PATTERN='(完成|已修|通过|完工|\bdone\b|\bpassed\b|\bfixed\b|\ball set\b|it works|works now|successfully|\bVERIFIED\b|ready to merge|ship it|ready to (ship|publish))'
if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE "$COMPLETION_PATTERN"; then
  do_it_debug verification-gate "decision=no-completion-language"
  _gate_finish 0
fi

# Host edit tools differ: Claude Edit/Write; Cursor StrReplace; Codex apply_patch.
EDIT_TOOL_PATTERN='"name"[[:space:]]*:[[:space:]]*"(Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook|apply_patch)"'
if ! printf '%s' "$CURRENT_TURN_BUF" | grep -qiE "$EDIT_TOOL_PATTERN"; then
  do_it_debug verification-gate "decision=no-edits"
  _gate_finish 0
fi

# An explicit lack of proof is not a completion claim. Require the missing proof
# and next step to remain visible rather than forcing an unrelated command.
if printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE '\bNOT_VERIFIED\b'; then
  do_it_debug verification-gate "decision=explicit-not-verified"
  _gate_finish 0
fi

# Require a shell tool use (Bash on Claude/OpenCode; Shell on Codex/Cursor) whose
# command itself is a relevant test/build/type/lint, package/doctor check, or
# focused source/config inspection. `pwd`, a bare shell, and prose mentions of a
# command do not satisfy this check.
EVIDENCE_COMMAND='(pnpm[[:space:]]+(test|build|exec|run)|npm[[:space:]]+(test|run|exec)|yarn[[:space:]]+(test|run|build)|vitest|jest|playwright|pytest|mypy|tsc|eslint|ruff|biome|prettier|cargo[[:space:]]+(test|run|build|check|clippy)|go[[:space:]]+(test|run|build|vet)|do-it[[:space:]]+doctor|git[[:space:]]+diff([[:space:]]|$)|git[[:space:]]+diff[[:space:]]+--check|node[[:space:]].*(validate|check|test|build)|python[[:space:]].*(test|check|validate))'
SHELL_EVIDENCE_PATTERN='"name"[[:space:]]*:[[:space:]]*"(Bash|Shell|bash|shell)".*"command"[[:space:]]*:[[:space:]]*"[^"]*'"$EVIDENCE_COMMAND"
if printf '%s' "$CURRENT_TURN_BUF" | grep -qiE "$SHELL_EVIDENCE_PATTERN"; then
  do_it_debug verification-gate "decision=have-relevant-evidence"
  _gate_finish 0
fi

REASON="do-it gate: completion was claimed after edits without fresh, relevant current-turn proof. Run a targeted test/build/type/lint/package/doctor check or a focused diff/config inspection and cite its result; otherwise state NOT_VERIFIED with the missing proof and next action. Bypass: say 'skip gate' or run /do-it-skip gate."
do_it_debug verification-gate "decision=block reason=no-relevant-evidence"
do_it_emit_block "$REASON"
_gate_finish 0
