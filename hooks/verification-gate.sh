#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
# Blocks Claude from declaring "done/passed/完成/通过" without recent verification
# evidence (Bash, pnpm test, vitest, jest, etc.) in the recent transcript tail.
#
# 0.5.0 changes:
#   - Completion-language detection narrowed to the *last* assistant message
#     instead of the last 80 transcript lines; prevents stale "done" from a
#     prior turn from re-triggering the gate this turn.
#   - Pass-through when the current turn made no Edit/Write/MultiEdit calls —
#     pure discussion / answer-the-question turns no longer get gated.
#   - Pass-through when the router classified this prompt as a question
#     (state.grilled == skip-question).
#   - Evidence pattern expanded: pytest, mypy, tsc, eslint, ruff, biome,
#     cargo (run|build|check), go (run|build|vet).

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

# Recursion guard: do not re-block when a previous Stop hook already blocked.
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  do_it_debug verification-gate "decision=skip-recursion"
  exit 0
fi

if do_it_check_skip "$SESSION_ID" gate; then
  do_it_debug verification-gate "decision=skip-flag"
  exit 0
fi

# Question turns: router tagged state.grilled=skip-question; never gate.
GRILLED_FLAG="$(do_it_session_state_get "$SESSION_ID" grilled)"
if [[ "$GRILLED_FLAG" == "skip-question" ]]; then
  do_it_debug verification-gate "decision=skip-question"
  exit 0
fi

if [[ -z "$TRANSCRIPT_PATH" || ! -f "$TRANSCRIPT_PATH" ]]; then
  exit 0
fi

# Window for "did this turn touch files / did it run verification": last 80
# JSONL lines is more than enough for one assistant turn.
TAIL_LINES=80
TAIL_BUF="$(tail -n "$TAIL_LINES" "$TRANSCRIPT_PATH" 2>/dev/null || true)"
if [[ -z "$TAIL_BUF" ]]; then
  exit 0
fi

# Pull the *last* assistant message text only. With jq this is precise; without
# jq, fall back to the last few transcript lines so we err on the side of not
# blocking.
LAST_ASSISTANT_TEXT=""
if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" \
    | jq -rs 'map(select(.type=="assistant"))
              | last
              | (.message.content // [])
              | map(select(.type=="text") | .text)
              | join("\n")' 2>/dev/null || true)"
fi
if [[ -z "$LAST_ASSISTANT_TEXT" ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" | tail -n 5)"
fi

# Detect completion claims in the last assistant message only.
COMPLETION_PATTERN='(完成|done|passed|已修|通过|fixed|works|all set|success|完工)'
if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE "$COMPLETION_PATTERN"; then
  do_it_debug verification-gate "decision=no-completion-language"
  exit 0
fi

# No-edit pass-through: if the recent tail has no Edit/Write/MultiEdit tool_use,
# this is a discussion turn — do not gate it.
EDIT_TOOL_PATTERN='"name"[[:space:]]*:[[:space:]]*"(Edit|Write|MultiEdit|NotebookEdit)"'
if ! printf '%s' "$TAIL_BUF" | grep -qiE "$EDIT_TOOL_PATTERN"; then
  do_it_debug verification-gate "decision=no-edits"
  exit 0
fi

# Detect verification evidence: Bash tool use or any of the known test / type /
# lint / build commands across the major language ecosystems.
EVIDENCE_PATTERN='"name"[[:space:]]*:[[:space:]]*"Bash"'
EVIDENCE_PATTERN+='|pnpm[[:space:]]+(test|build|exec|run)'
EVIDENCE_PATTERN+='|npm[[:space:]]+(test|run|exec)'
EVIDENCE_PATTERN+='|yarn[[:space:]]+(test|run|build)'
EVIDENCE_PATTERN+='|vitest|jest|playwright'
EVIDENCE_PATTERN+='|pytest|mypy|tsc|eslint|ruff|biome|prettier'
EVIDENCE_PATTERN+='|cargo[[:space:]]+(test|run|build|check|clippy)'
EVIDENCE_PATTERN+='|go[[:space:]]+(test|run|build|vet)'

if printf '%s' "$TAIL_BUF" | grep -qiE "$EVIDENCE_PATTERN"; then
  do_it_debug verification-gate "decision=have-evidence"
  exit 0
fi

REASON="do-it verification-gate: completion language detected (e.g. 'done/passed/完成/通过') in the latest response, but no verification evidence (Bash command, pnpm test, vitest, pytest, cargo test, etc.) appears in the recent transcript. Run the verification command and cite its output before claiming the task is complete. To bypass: include 'skip gate' / 'yolo' in the next message, or run /do-it-skip gate."

do_it_debug verification-gate "decision=block reason=no-evidence"
do_it_emit_block "$REASON"
exit 0
