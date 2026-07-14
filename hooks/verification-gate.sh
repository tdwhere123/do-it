#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
#
# Claim-integrity guard: after edits, completion language needs fresh, relevant
# current-turn evidence. Evidence is a paired verification tool_use and an
# explicit successful tool result, not command-shaped transcript text.
# `NOT_VERIFIED` is always an honest alternative.

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

# Anchored evidence matcher (mirrors OpenCode evidenceCommand): split on
# && / || / ; / |, strip env prefixes, require the verification token at the
# start of a segment. Substring carriers like `echo pnpm test` do not count.
_gate_command_is_evidence() {
  local command="$1"
  local normalized segment rest
  normalized="$(printf '%s' "$command" | tr '\r\n\t' ' ' | tr -s ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -n "$normalized" ]] || return 1
  rest="$normalized"
  while [[ -n "$rest" ]]; do
    case "$rest" in
      *'&&'*) segment="${rest%%&&*}"; rest="${rest#*&&}" ;;
      *'||'*) segment="${rest%%||*}"; rest="${rest#*||}" ;;
      *';'*)  segment="${rest%%;*}";  rest="${rest#*;}" ;;
      *'|'*)  segment="${rest%%|*}";  rest="${rest#*|}" ;;
      *)      segment="$rest"; rest="" ;;
    esac
    segment="$(printf '%s' "$segment" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    segment="$(printf '%s' "$segment" | sed -E 's/^(env[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'\''[^'\'']*'\''|[^[:space:];|&]+)[[:space:]]+)+//')"
    segment="$(printf '%s' "$segment" | sed -E 's/^command[[:space:]]+//')"
    [[ -n "$segment" ]] || continue
    if printf '%s' "$segment" | grep -qiE '^(pnpm[[:space:]]+(test|build|exec|run)|npm[[:space:]]+(test|run|exec)|yarn[[:space:]]+(test|run|build)|vitest|jest|playwright|pytest|mypy|tsc|eslint|ruff|biome|prettier|cargo[[:space:]]+(test|run|build|check|clippy)|go[[:space:]]+(test|run|build|vet)|do-it[[:space:]]+doctor|git[[:space:]]+diff\b|node[[:space:]].*(validate|check|test|build)|python(3)?[[:space:]].*(test|check|validate))([[:space:]]|$)'; then
      return 0
    fi
  done
  return 1
}

_gate_paired_commands_have_evidence() {
  local line cmd
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    cmd="${line#*$'\t'}"
    [[ "$cmd" == "$line" ]] && cmd="$line"
    if _gate_command_is_evidence "$cmd"; then
      return 0
    fi
  done <<< "$1"
  return 1
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

# Shared jq helpers reused by turn slice, edit detect, and paired evidence.
# Keep one copy so success/pairing fixes cannot drift across programs.
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
  def success:
    if has("is_error") then .is_error == false
    elif has("status") then
      ((.status | tostring | ascii_downcase) as $s
       | ($s == "success" or $s == "succeeded" or $s == "completed" or $s == "ok"))
    elif (.type? == "tool_result") then true
    else false end;
  def human_user:
    ((.type? == "user" or .role? == "user") and
     (([blocks[]? | select(.type? == "tool_result")] | length) == 0));
'

# Parse JSONL before making any claim decision. The current turn starts after
# the last human user message; user-shaped tool_result frames stay inside it.
# Without a structurally valid slice, raw transcript text cannot safely prove a
# result, so completion after an apparent edit fails closed below.
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
if [[ "$PARSE_OK" -eq 1 ]]; then
  if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE "$COMPLETION_PATTERN"; then
    do_it_debug verification-gate "decision=no-completion-language"
    _gate_finish 0
  fi
else
  if ! printf '%s' "$TAIL_BUF" | grep -qiE "$COMPLETION_PATTERN"; then
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
elif printf '%s' "$TAIL_BUF" | grep -qiE '"name"[[:space:]]*:[[:space:]]*"(Edit|Write|MultiEdit|NotebookEdit|StrReplace|EditNotebook|apply_patch)"'; then
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
elif printf '%s' "$TAIL_BUF" | grep -qiE '\bNOT_VERIFIED\b'; then
  do_it_debug verification-gate "decision=unparsed-explicit-not-verified"
  _gate_finish 0
fi

# Normalize supported transcript shapes into successful tool-use pairs:
# - Claude-style content blocks: tool_use.id + tool_result.tool_use_id,
#   with is_error:false, an explicit success status, or omitted is_error on
#   type:tool_result (Claude success convention).
# - role-based tool frames: assistant tool_use + role:tool/tool_call_id,
#   with an explicit success status (missing status proves nothing).
# A result must follow its matching use in this turn, and the use must come
# after the last edit in the turn. Missing ids, failed results, and
# unpaired/forged results prove nothing.
PAIRED_COMMANDS=""
if [[ "$PARSE_OK" -eq 1 ]]; then
  PAIRED_COMMANDS="$(printf '%s' "$CURRENT_TURN_JSON" | jq -r --arg re "$EDIT_TOOL_PATTERN" "${JQ_GATE_PRELUDE}"'
    ([to_entries[] as $entry
      | $entry.value as $frame
      | $frame | tool_uses[]
      | select((.name? // "") | test($re))
      | $entry.key] | max // -1) as $last_edit
    | [to_entries[] as $entry
      | $entry.value as $frame
      | $frame | tool_uses[]
      | {index: $entry.key,
         id: (.id? // ""),
         name: (.name? // ""),
         command: (.input.command? // "")}
      | select((.id | type) == "string" and .id != "")
      | select((.command | type) == "string" and .command != "")
      | select(.name == "Bash" or .name == "Shell" or .name == "bash" or .name == "shell")
    ] as $uses
    | [to_entries[] as $entry
       | $entry.value as $frame
       | (([$frame | blocks[]?
             | select(.type? == "tool_result")
             | {index: $entry.key,
                id: (.tool_use_id? // .call_id? // .id? // ""),
                ok: success}])
          + (if ($frame.role? == "tool" or $frame.type? == "tool_result") then
               [{index: $entry.key,
                 id: ($frame.tool_call_id? // $frame.tool_use_id? // $frame.call_id? // $frame.id? // ""),
                 ok: ($frame | success)}]
             else [] end))[]
       | select((.id | type) == "string" and .id != "" and .ok == true)
      ] as $results
    | $uses[] as $use
    | select($use.index > $last_edit)
    | select(any($results[]; .id == $use.id and .index > $use.index))
    | [$use.id, ($use.command | gsub("[\\r\\n\\t]+"; " "))]
    | @tsv
  ' 2>/dev/null || true)"
fi

if [[ -n "$PAIRED_COMMANDS" ]] && _gate_paired_commands_have_evidence "$PAIRED_COMMANDS"; then
  do_it_debug verification-gate "decision=have-successful-paired-evidence"
  _gate_finish 0
fi

REASON="do-it gate: completion was claimed after edits without fresh, relevant current-turn proof. Run a targeted test/build/type/lint/package/doctor check or a focused diff/config inspection and cite its successful result; otherwise state NOT_VERIFIED with the missing proof and next action. Bypass: say 'skip gate' or run /do-it-skip gate."
do_it_debug verification-gate "decision=block reason=no-successful-paired-evidence"
do_it_emit_block "$REASON"
_gate_finish 0
