#!/usr/bin/env bash
# do-it verification reminder (Stop hook).
#
# Claim-integrity advisory: after edits, a completion claim deserves fresh,
# claim-specific proof from this worktree. The hook never infers proof from a
# command shape and never blocks ordinary local work. `NOT_VERIFIED` remains an
# honest alternative.

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

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  do_it_debug verification-gate "decision=skip-no-transcript"
  _gate_finish 0
fi

TAIL_BUF="$(tail -n 400 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
[[ -z "$TAIL_BUF" ]] && _gate_finish 0

# Shared jq helpers for current-turn slicing and edit detection.
JQ_GATE_PRELUDE='
  def parse_args:
    if type == "string" then (try (fromjson) catch {}) else . end;
  def blocks:
    ((.message.content? // .content? // []) as $content
     | if ($content | type) == "array" then $content else [] end);
  def tool_uses:
    [blocks[]? | select(.type? == "tool_use" or .type? == "function_call")]
    + [if .tool_calls? | type == "array" then
         .tool_calls[]? | {
           id: (.id? // ""),
           name: (.function.name? // .name? // ""),
           input: (((.function.arguments // .arguments // {}) | parse_args) // {})
         }
       else empty end];
  def human_user:
    ((.type? == "user" or .role? == "user") and
     (([blocks[]? | select(.type? == "tool_result")] | length) == 0));
'

# Parse JSONL before making any claim decision. The current turn starts after
# the last human user message; user-shaped tool_result frames stay inside it.
# Without a structurally valid slice, only a bounded raw fallback may decide
# whether to emit a reminder; it never establishes or denies proof.
CURRENT_TURN_JSON=""
PARSE_OK=0
if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
  CURRENT_TURN_JSON="$(printf '%s\n' "$TAIL_BUF" | jq -cs "${JQ_GATE_PRELUDE}"'
    ([to_entries[] | select(.value | human_user) | .key] | last // -1) as $last_user
    | .[($last_user + 1):]
  ' 2>/dev/null)" && PARSE_OK=1
fi

LAST_ASSISTANT_TEXT=""
if [[ "$PARSE_OK" -eq 1 ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s' "$CURRENT_TURN_JSON" | jq -r "${JQ_GATE_PRELUDE}"'
    [.[]
      | select(.type? == "assistant" or .role? == "assistant")
      | if (.message.content? | type) == "string" then .message.content
        elif (.content? | type) == "string" then .content
        else [blocks[]?
              | select(.type? == "text")
              | (.text? // .content? // "")]
             | join("\n")
        end]
    | last // ""
  ' 2>/dev/null || true)"
fi

COMPLETION_PATTERN='(完成|已修|通过|完工|\bdone\b|\bpassed\b|\bfixed\b|\ball set\b|it works|works now|successfully|\bVERIFIED\b|ready to merge|ship it|ready to (ship|publish))'
# Unparsed fallback: only the last UNPARSED_RECENT_LINES of TAIL_BUF count for
# completion / NOT_VERIFIED greps so older turns cannot satisfy (or excuse) the
# current claim. Prefer a fixed line window over fragile assistant heuristics
# when jq could not produce a turn slice.
UNPARSED_RECENT_LINES=20
UNPARSED_SLICE="$TAIL_BUF"
if [[ "$PARSE_OK" -ne 1 ]]; then
  UNPARSED_SLICE="$(printf '%s\n' "$TAIL_BUF" | tail -n "$UNPARSED_RECENT_LINES")"
fi
if [[ "$PARSE_OK" -eq 1 ]]; then
  if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE "$COMPLETION_PATTERN"; then
    do_it_debug verification-gate "decision=no-completion-language"
    _gate_finish 0
  fi
else
  if ! printf '%s' "$UNPARSED_SLICE" | grep -qiE "$COMPLETION_PATTERN"; then
    do_it_debug verification-gate "decision=unparsed-no-completion-language"
    _gate_finish 0
  fi
fi

EDIT_TOOL_PATTERN='^(Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook|apply_patch)$'
HAVE_EDIT=0
if [[ "$PARSE_OK" -eq 1 ]]; then
  if printf '%s' "$CURRENT_TURN_JSON" | jq -er --arg re "$EDIT_TOOL_PATTERN" "${JQ_GATE_PRELUDE}"'
    any(.[];
      any(tool_uses[]; (.name? // "") | test($re)))
  ' >/dev/null 2>&1; then
    HAVE_EDIT=1
  fi
elif printf '%s' "$UNPARSED_SLICE" | grep -qiE '"name"[[:space:]]*:[[:space:]]*"(Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook|apply_patch)"'; then
  HAVE_EDIT=1
fi

if [[ "$HAVE_EDIT" -ne 1 ]]; then
  do_it_debug verification-gate "decision=no-edits"
  _gate_finish 0
fi

# An explicit lack of proof is not a completion claim. Keep the missing proof
# and next step visible rather than forcing an unrelated command. Honor this
# even when the transcript failed to parse as JSONL.
if [[ "$PARSE_OK" -eq 1 ]]; then
  if printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE '\bNOT_VERIFIED\b'; then
    do_it_debug verification-gate "decision=explicit-not-verified"
    _gate_finish 0
  fi
elif printf '%s' "$UNPARSED_SLICE" | grep -qiE '\bNOT_VERIFIED\b'; then
  do_it_debug verification-gate "decision=unparsed-explicit-not-verified"
  _gate_finish 0
fi

REMINDER="<system-reminder>
do-it verify (advisory): an edited completion claim needs fresh, claim-specific proof from this worktree. Before finalizing, compare that proof with the claim and report its actual result; if proof is unavailable, state NOT_VERIFIED with the missing proof and next action. This hook does not infer verification from command names.
</system-reminder>"
do_it_debug verification-gate "decision=advisory reason=edited-completion-claim"
do_it_emit_context Stop "$REMINDER"
_gate_finish 0
