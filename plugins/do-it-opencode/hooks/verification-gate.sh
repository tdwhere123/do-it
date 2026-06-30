#!/usr/bin/env bash
# do-it verification-gate (Stop hook).
# Blocks Claude from declaring "done/passed/完成/通过" without recent verification
# evidence (Bash, pnpm test, vitest, jest, etc.) in the recent transcript tail.
#
# Current gate scope:
#   - evaluate completion-language only in the last assistant message so stale
#     earlier claims do not re-trigger the gate;
#   - scope edit / evidence / review-loop detection to the current turn (the
#     transcript lines after the last user message) so an earlier turn's trace
#     cannot silently satisfy a later unverified turn;
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

# Window for "did this turn touch files / did it run verification". The window
# is generous because the per-turn slice below (CURRENT_TURN_BUF) is what the
# edit/evidence/review checks actually read, so a larger window only widens how
# long a turn can be without losing coverage — it cannot leak a stale trace.
TAIL_LINES=400
TAIL_BUF="$(tail -n "$TAIL_LINES" "$TRANSCRIPT_PATH" 2>/dev/null || true)"
if [[ -z "$TAIL_BUF" ]]; then
  exit 0
fi

# Pull the *last* assistant message text only. With jq this is precise — an
# empty result means the last assistant frame was tool-only and the gate
# should treat the turn as silent (no completion claim). Without jq we have
# to fall back to the last raw lines, which is less precise but keeps the
# gate functional on minimal images.
LAST_ASSISTANT_TEXT=""
JQ_PARSED=0
if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" \
    | jq -rs 'map(select(.type=="assistant"))
              | last
              | (.message.content // [])
              | map(select(.type=="text") | .text)
              | join("\n")' 2>/dev/null || true)"
  JQ_PARSED=1
fi
if [[ "$JQ_PARSED" -eq 0 && -z "$LAST_ASSISTANT_TEXT" ]]; then
  LAST_ASSISTANT_TEXT="$(printf '%s\n' "$TAIL_BUF" | tail -n 5)"
fi

# Slice the tail to the current turn: every line after the last user message.
# The edit / evidence / review-loop checks read this slice instead of the full
# tail, so a verification command or review-loop trace from an earlier turn
# cannot pass a later unverified turn (the documented dim_needs_review_loop
# staleness). When a turn is longer than the tail window the user line has
# scrolled out and the whole tail is already the current turn — falling back to
# TAIL_BUF is then correct.
CURRENT_TURN_BUF="$TAIL_BUF"
_last_user_line="$(printf '%s\n' "$TAIL_BUF" \
  | grep -nE '"(type|role)"[[:space:]]*:[[:space:]]*"user"' \
  | tail -n1 | cut -d: -f1)"
if [[ -n "$_last_user_line" ]]; then
  case "$_last_user_line" in
    ''|*[!0-9]*) _last_user_line="" ;;
  esac
  if [[ -n "$_last_user_line" ]]; then
    CURRENT_TURN_BUF="$(printf '%s\n' "$TAIL_BUF" | tail -n +"$((_last_user_line + 1))")"
  fi
fi

# Detect completion claims in the last assistant message only.
COMPLETION_PATTERN='(完成|done|passed|已修|通过|fixed|works|all set|success|完工)'
if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE "$COMPLETION_PATTERN"; then
  do_it_debug verification-gate "decision=no-completion-language"
  exit 0
fi

# No-edit pass-through: if the current turn has no Edit/Write/MultiEdit
# tool_use, this is a discussion turn — do not gate it.
EDIT_TOOL_PATTERN='"name"[[:space:]]*:[[:space:]]*"(Edit|Write|MultiEdit|NotebookEdit)"'
if ! printf '%s' "$CURRENT_TURN_BUF" | grep -qiE "$EDIT_TOOL_PATTERN"; then
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
    INLINE_REASON="do-it gate: code changed and completion was claimed without an inline self-review. Review the diff for correctness regressions, missing tests, boundary error handling, and comment discipline, then emit one line starting with the \`inline-review:\` marker stating clean or a finding. Bypass: say 'skip gate' or run /do-it-skip gate."
    do_it_debug verification-gate "decision=block reason=no-inline-review tier=Light"
    do_it_emit_block "$INLINE_REASON"
    exit 0
  fi
  do_it_debug verification-gate "decision=have-inline-review tier=Light"
fi

# Dimension-aware checks: for Standard/Heavy turns the router writes orthogonal
# dimensions into session state. Two are gate-relevant.
#
# `dim_breaks_interface=1`: the diff promised an interface/contract change.
#   Require the inline-review marker to explicitly name `interface` or
#   `contract` so the agent has at least asserted it covered that surface.
# `dim_needs_review_loop=1`: a review-loop signal in the current turn is
#   required before a "done" claim passes (any reference to review-loop,
#   review-quick, review-deep, or review-adversarial counts). Scoped to
#   CURRENT_TURN_BUF so an earlier turn's trace cannot satisfy this turn.
#
# Both are passive: missing session state degrades to the original tier-only
# behavior so a fresh checkout or non-router invocation never deadlocks.

DIM_BREAKS_INTERFACE="$(do_it_session_state_get "$SESSION_ID" dim_breaks_interface)"
DIM_NEEDS_REVIEW_LOOP="$(do_it_session_state_get "$SESSION_ID" dim_needs_review_loop)"

if [[ "$DIM_BREAKS_INTERFACE" == "1" ]]; then
  # The inline-review marker satisfies P1; here we additionally require the
  # marker line to mention interface/contract/schema so the reviewer attested
  # to the breaking surface, not just generic correctness.
  if ! printf '%s' "$LAST_ASSISTANT_TEXT" | grep -qiE '^[[:space:]]*inline-review[-:].*(interface|contract|schema|api)'; then
    REASON_IFACE="do-it gate: this turn changed an interface, schema, or API but the \`inline-review:\` line does not name the surface. Re-run an interface-drill review and re-emit the marker line naming the interface, contract, schema, or api you checked. Bypass: say 'skip gate' or run /do-it-skip gate."
    do_it_debug verification-gate "decision=block reason=breaks-interface-no-attestation"
    do_it_emit_block "$REASON_IFACE"
    exit 0
  fi
  do_it_debug verification-gate "decision=have-interface-attestation"
fi

if [[ "$DIM_NEEDS_REVIEW_LOOP" == "1" ]]; then
  REVIEW_PATTERN='review-loop|review-quick|review-deep|review-adversarial|do-it-review-loop'
  if ! printf '%s' "$CURRENT_TURN_BUF" | grep -qiE "$REVIEW_PATTERN"; then
    REASON_REVIEW="do-it gate: this turn needs a review-loop (Heavy tier or interface-breaking change) but no review trace is present in it. Run do-it-review-loop on the delivered surface before claiming done. Bypass: say 'skip gate' or run /do-it-skip gate."
    do_it_debug verification-gate "decision=block reason=needs-review-loop-no-trace"
    do_it_emit_block "$REASON_REVIEW"
    exit 0
  fi
  do_it_debug verification-gate "decision=have-review-loop-trace"
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

if printf '%s' "$CURRENT_TURN_BUF" | grep -qiE "$EVIDENCE_PATTERN"; then
  do_it_debug verification-gate "decision=have-evidence"
  exit 0
fi

REASON="do-it gate: completion was claimed but this turn ran no verification. Run the verification command (tests, build, lint, or type-check) and cite its output before claiming done. Bypass: say 'skip gate' or run /do-it-skip gate."

do_it_debug verification-gate "decision=block reason=no-evidence"
do_it_emit_block "$REASON"
exit 0
