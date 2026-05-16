#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
# Blocks Claude from declaring "done/passed/完成/通过" without recent verification
# evidence (Bash, pnpm test, vitest, jest, etc.) in the recent transcript tail.
#
# Current gate scope:
#   - evaluate completion-language only in the last assistant message so stale
#     earlier claims do not re-trigger the gate;
#   - pass through pure discussion turns and prompts the router classified as a
#     question;
#   - accept common verification commands including pytest, mypy, tsc, eslint,
#     ruff, biome, cargo, and go checks;
#   - for Light-tier edit turns, require an inline-review marker before the
#     fresh-evidence check. Inline review covers code correctness/comment
#     discipline; fresh evidence covers the verification command.

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

# Question turns: router tagged state.last_prompt_kind=question; never gate.
LAST_PROMPT_KIND="$(do_it_session_state_get "$SESSION_ID" last_prompt_kind)"
GRILLED_FLAG="$(do_it_session_state_get "$SESSION_ID" grilled)"
if [[ "$LAST_PROMPT_KIND" == "question" ]] || [[ -z "$LAST_PROMPT_KIND" && "$GRILLED_FLAG" == "skip-question" ]]; then
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

# review-quick inline-review for Light tier: when the router classified this
# session as Light AND the recent tail shows an Edit/Write/MultiEdit tool_use
# (heuristic for "this session touched code"), require an inline-review
# marker in the transcript before letting "done" through. The marker is any
# of `inline-review: clean`, `inline-review-clean: yes`, or
# `inline-review: <finding>` — produced by the agent after running the
# self-review prompt described in skills/do-it/do-it-review-loop/SKILL.md.
#
# This is orthogonal to the fresh-evidence check below: inline-review covers
# code-level correctness + comment discipline; fresh-evidence covers
# verification-command output. The agent may need to address both.
TIER="$(do_it_session_state_get "$SESSION_ID" tier)"
if [[ "$TIER" == "Light" ]]; then
  # Match only at the start of a line in the LAST assistant text. This avoids
  # two failure modes:
  #   1. The gate's own block reason gets replayed back into the transcript;
  #      if the reason itself contained an unwrapped `inline-review:` token
  #      anywhere, the next gate invocation would self-satisfy. We require a
  #      line-anchored marker and we shape the block reason below so its
  #      `inline-review` mention sits mid-line behind a backtick.
  #   2. Free-prose mentions of `inline-review` mid-sentence would falsely
  #      satisfy the gate. The line anchor forces the agent to emit the
  #      marker as its own line, the way the SKILL prompt instructs.
  # Accepted shapes (anywhere after the leading whitespace + `inline-review`):
  #   inline-review: clean
  #   inline-review: <any non-empty finding>
  #   inline-review-clean: yes
  INLINE_REVIEW_PATTERN='^[[:space:]]*inline-review[-:]'
  if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qE "$INLINE_REVIEW_PATTERN"; then
    # Build the block reason carefully: no bare `inline-review:` token at the
    # start of any line, so a transcript replay of this reason cannot
    # self-satisfy the regex above. The example token is wrapped in backticks
    # and embedded mid-sentence.
    INLINE_REASON="do-it review-quick (Light tier): this session edited code and the latest response declares completion, but no inline self-review marker is present on its own line in the recent transcript. Before claiming done, run an inline self-review of the diff and check: (a) any obvious correctness regression; (b) missing tests if behavior changed; (c) error handling at boundaries; (d) comment-discipline violations (only @anchor: / see also: / invariant: / type annotations / tool directives are allowed — flag narrative or task-reference comments). Then output a single line that begins with the marker prefix \`inline-review:\` (clean, or a finding) — for example a line whose content is the literal phrase \`inline-review\` followed by a colon then \`clean\`. To bypass: include 'skip gate' / 'yolo' in the next message, or run /do-it-skip gate."
    do_it_debug verification-gate "decision=block reason=no-inline-review tier=Light"
    do_it_emit_block "$INLINE_REASON"
    exit 0
  fi
  do_it_debug verification-gate "decision=have-inline-review tier=Light"
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
