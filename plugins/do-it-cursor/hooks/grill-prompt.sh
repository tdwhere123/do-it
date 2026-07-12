#!/usr/bin/env bash
# do-it grill (UserPromptSubmit half).
# Meaning-centric slim: injects on Heavy tier only, or when the user explicitly
# requests grill / pressure-test. Standard stays silent (no compact pointer).
# Light never auto-grills.
#
# Current grill prompt scope:
#   - once a session is already grilled, skip repeated reminders unless the user
#     explicitly asks to re-grill;
#   - skip question and discussion turns via router state plus direct detection;
#   - Heavy-tier turns receive the fuller fact-first grill reminder; explicit
#     grill on any tier uses the same reminder shape.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/keywords.sh
source "${SCRIPT_DIR}/lib/keywords.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

# Advisory nudges (plan-card reliability, existing-codebase discipline) are
# computed once on a work turn and attached to whichever exit path this hook
# takes, so they fire even when the grill reminder itself does not. Advisory
# only — never blocks.
_doit_advisory=""
_emit_advisory_exit() {
  [[ -n "$_doit_advisory" ]] && do_it_emit_context UserPromptSubmit "$_doit_advisory"
  exit 0
}

# Read stdin first so the subagent check can use the JSON-supplied
# transcript_path (the host delivers it on stdin, not as an env var).
RAW_INPUT="$(do_it_read_stdin)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"

# Subagent contexts inherit grill from the parent — re-injecting the grill
# reminder again would just burn tokens, so bail before doing any work.
if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug grill-prompt "decision=subagent-skip"
  exit 0
fi

do_it_source_local_keywords "$CWD"
do_it_session_state_inc "$SESSION_ID" hook_invocations grill_prompt

# Escape / skip keywords: write only the parsed skip targets for this turn.
targets="$(do_it_parse_skip_targets "$PROMPT")"
if [[ -n "$targets" ]]; then
  do_it_debug grill-prompt "decision=escape targets=$targets"
  # shellcheck disable=SC2086
  do_it_write_skip "$SESSION_ID" $targets
  if [[ " $targets " == *" grill "* ]]; then
    exit 0
  fi
fi

if do_it_check_skip "$SESSION_ID" grill; then
  do_it_debug grill-prompt "decision=skip-flag"
  exit 0
fi

# Detect explicit grill / re-grill requests so a returning user can force it
# back on without relying on intent verbs.
PROMPT_LC="$(do_it_lc "$PROMPT")"
EXPLICIT_GRILL=0
RE_GRILL=0
case "$PROMPT_LC" in
  *"grill"*|*"pressure-test"*|*"pressure test"*|*"压力测试"*|*"压测"*|*"挑战一下"*|*"拷问"*|*"审视一下"*)
    EXPLICIT_GRILL=1
    ;;
esac
case "$PROMPT_LC" in
  *"重新 grill"*|*"重新grill"*|*"再 pressure-test"*|*"再pressure-test"*|*"重新审视"*|*"re-grill"*|*"regrill"*)
    EXPLICIT_GRILL=1
    RE_GRILL=1
    ;;
esac

LAST_PROMPT_KIND="$(do_it_session_state_get "$SESSION_ID" last_prompt_kind)"

# Question turns: router has already classified Light and tagged the prompt
# kind, but keep local detection as a fallback when the hook is run alone.
# A direct "grill this?" request is still a manual grill request, not an
# ordinary discussion turn.
if [[ "$EXPLICIT_GRILL" -eq 0 ]] && { [[ "$LAST_PROMPT_KIND" == "question" ]] || do_it_prompt_is_question "$PROMPT"; }; then
  do_it_debug grill-prompt "decision=question"
  exit 0
fi

# ---- One-shot advisory nudges (work turns only; never block) ----
ADVISORY_TIER="$(do_it_session_state_get "$SESSION_ID" tier)"

# Plan-card nudge: grill ran in a prior turn and durable planning is required,
# but no plan card exists yet — nudge to land it before implementation drifts ahead.
_grilled_prev="$(do_it_session_state_get "$SESSION_ID" grilled)"
if [[ "$(do_it_session_state_get "$SESSION_ID" plan_nudged)" != "1" \
   && "$(do_it_session_state_get "$SESSION_ID" durable_plan_seen)" == "1" \
   && -n "$_grilled_prev" && "$_grilled_prev" != "0" && "$_grilled_prev" != "skip-question" ]] \
   && ! ls "${CWD}/.do-it/plans/"*.md >/dev/null 2>&1; then
  do_it_session_state_set "$SESSION_ID" plan_nudged 1
  _doit_advisory="${_doit_advisory}<system-reminder>
do-it decide: this is durable coordination work, but no plan card exists yet. Use do-it-decide to record only the goal, acceptance evidence, failure-mode forecast, and path map that another worker or session needs. Advisory — proceed inline when the modification map already covers the work.
</system-reminder>"
fi

# Existing-codebase / port-restore "understand before you change" nudge.
if [[ "$(do_it_session_state_get "$SESSION_ID" brownfield_nudged)" != "1" ]]; then
  _port="$(do_it_session_state_get "$SESSION_ID" port_intent)"
  _brown="$(do_it_session_state_get "$SESSION_ID" dim_brownfield)"
  _touch="$(do_it_session_state_get "$SESSION_ID" dim_touches_code)"
  if [[ "$_port" == "1" ]]; then
    do_it_session_state_set "$SESSION_ID" brownfield_nudged 1
    _doit_advisory="${_doit_advisory}<system-reminder>
do-it (existing code): this looks like port / restore / reintroduce work. Before writing a 'port' plan, grep/Glob the current packages/apps/migrations for the target name — it may already exist; if so, extend it instead of rebuilding. Advisory.
</system-reminder>"
  elif [[ "$_brown" == "1" && "$_touch" == "1" ]] && { [[ "$ADVISORY_TIER" == "Standard" || "$ADVISORY_TIER" == "Heavy" ]]; }; then
    do_it_session_state_set "$SESSION_ID" brownfield_nudged 1
    _doit_advisory="${_doit_advisory}<system-reminder>
do-it (existing code): this is an established codebase. Before editing, read the file/area you are changing and reuse its existing patterns, names, and invariants (.do-it/CONTEXT.md and handbook if present) rather than assuming greenfield. Advisory.
</system-reminder>"
  fi
fi

# Same-session de-dup: if we already grilled and the user did not re-request,
# stay quiet.
if [[ "$RE_GRILL" -eq 0 ]]; then
  GRILLED="$(do_it_session_state_get "$SESSION_ID" grilled)"
  if [[ "$GRILLED" == "skip-question" && "$LAST_PROMPT_KIND" != "question" ]]; then
    do_it_session_state_set "$SESSION_ID" grilled "0"
    GRILLED="0"
  fi
  if [[ -n "$GRILLED" && "$GRILLED" != "0" && "$GRILLED" != "skip-question" ]]; then
    do_it_debug grill-prompt "decision=already-grilled state=$GRILLED"
    _emit_advisory_exit
  fi
fi

TRIGGER=""
TIER="$(do_it_session_state_get "$SESSION_ID" tier)"

# Heavy tier always triggers grill — high risk earns the budget regardless of
# whether another trigger appears in the prompt itself.
if [[ "$TIER" == "Heavy" ]]; then
  TRIGGER="heavy-tier"
fi

# Meaning-centric slim: grill injects only on Heavy (or explicit "grill").
# Standard stays silent so small engineering work is not ceremony-taxed.
if [[ -z "$TRIGGER" && "$EXPLICIT_GRILL" -eq 1 ]]; then
  TRIGGER="explicit"
fi
if [[ -z "$TRIGGER" ]]; then
  do_it_debug grill-prompt "decision=no-trigger tier=$TIER reason=heavy-or-explicit-only"
  _emit_advisory_exit
fi

MSG="<system-reminder>
do-it grill (trigger: ${TRIGGER}). Before planning or code: (1) necessity — does this need to exist? (2) verify the load-bearing premise against local files (path:line); (3) at most one user decision question with 2-3 options and a default. Prefer do-it-decide. Skip: 'skip grill' / /do-it-skip grill. Full escape: yolo / /do-it-skip.
</system-reminder>"

do_it_session_state_set "$SESSION_ID" grilled 1
do_it_debug grill-prompt "decision=emit tier=$TIER trigger=$TRIGGER mode=$([ "$TIER" = "Heavy" ] && echo full || echo pointer)"

# Debug-only: append trigger reason inside an HTML comment.
case "${DO_IT_DEBUG:-0}" in
  ''|0|false|FALSE|off|OFF) ;;
  *)
    MSG="${MSG}
<!-- triggered by: tier=${TIER}, trigger=${TRIGGER} -->"
    ;;
esac

do_it_emit_context UserPromptSubmit "${MSG}${_doit_advisory}"
exit 0
