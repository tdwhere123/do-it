#!/usr/bin/env bash
# do-it adaptive profile injection (UserPromptSubmit).
# Injects valid Active bullets once per session hash. Missing profile is
# silent (0 tokens). Invalid entries are skipped with one bounded diagnostic.
# Subagent/child context does not receive the full profile.
# Schema: skills/do-it/references/adaptive-policy.md

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"
# shellcheck source=lib/adaptive-profile.sh
source "${SCRIPT_DIR}/lib/adaptive-profile.sh"

_DOIT_ADAPTIVE_MAX=8
_DOIT_ADAPTIVE_STMT_MAX=120
_DOIT_ADAPTIVE_SCOPES=" all decide build architecture review verify report delegation "
_DOIT_ADAPTIVE_REASONS=""

_doit_adaptive_add_reason() {
  local reason="$1"
  case ",${_DOIT_ADAPTIVE_REASONS}," in
    *",${reason},"*) return 0 ;;
  esac
  if [[ -n "$_DOIT_ADAPTIVE_REASONS" ]]; then
    _DOIT_ADAPTIVE_REASONS="${_DOIT_ADAPTIVE_REASONS},${reason}"
  else
    _DOIT_ADAPTIVE_REASONS="$reason"
  fi
}

# Mechanical classify. Prints a reason code or empty when the bullet is legal.
# Does not judge semantic conflict with a contract or repo.
_doit_adaptive_reason() {
  local id="$1" scope="$2" stmt="$3"
  case "$id" in
    P[0-9][0-9][0-9]) ;;
    *) printf 'bad-id'; return 0 ;;
  esac
  case " ${_DOIT_ADAPTIVE_SCOPES} " in
    *" ${scope} "*) ;;
    *) printf 'illegal-scope'; return 0 ;;
  esac
  if [[ -z "$stmt" ]]; then
    printf 'empty'
    return 0
  fi
  if [[ "${#stmt}" -gt "$_DOIT_ADAPTIVE_STMT_MAX" ]]; then
    printf 'overlong'
    return 0
  fi
  if printf '%s' "$stmt" | grep -Ei \
    '\br-(route|evidence|scope|verify|uncertainty|boundary|report|recovery)\b' \
    >/dev/null 2>&1; then
    printf 'core-weaken'
    return 0
  fi
  if printf '%s' "$stmt" | grep -Ei \
    'weaken|override core|bypass (core|no-write|verif)|ignore (core|no-write|verif)|skip (core|no-write|verif|confirmation)|do not verify|don'\''t verify|without evidence|fake evidence|invent evidence' \
    >/dev/null 2>&1; then
    printf 'core-weaken'
    return 0
  fi
  if printf '%s' "$stmt" | grep -Ei \
    '(^|[[:space:]])(~/|/|\.\./|\./|[A-Za-z]:\\|\\)|\.do-it\b|[[:alnum:]._-]+\.(ts|tsx|js|mjs|cjs|sh|md|json|jsonl|py|go|rs)\b|password|api[_-]?key|secret|credential|private[_-]?key|[{}`]|\bevent_id\b|\btask_id\b' \
    >/dev/null 2>&1; then
    printf 'banned-content'
    return 0
  fi
  printf ''
}

_doit_adaptive_exit() {
  exit 0
}

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
[[ -n "$CWD" ]] || CWD="."

if do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  do_it_debug adaptive-context "decision=skip reason=subagent"
  _doit_adaptive_exit
fi

do_it_session_state_inc "$SESSION_ID" hook_invocations adaptive_context 2>/dev/null || true

current_hash="$(do_it_adaptive_profile_hash "$CWD")"
last_hash="$(do_it_session_state_get "$SESSION_ID" adaptive_profile_hash)"
if [[ "$current_hash" == "$last_hash" ]]; then
  do_it_debug adaptive-context "decision=skip reason=unchanged-hash"
  _doit_adaptive_exit
fi

path="$(do_it_adaptive_profile_resolve "$CWD")"
if [[ -z "$path" || ! -f "$path" || ! -r "$path" ]]; then
  do_it_session_state_set "$SESSION_ID" adaptive_profile_hash "" 2>/dev/null || true
  do_it_debug adaptive-context "decision=skip reason=missing-profile"
  _doit_adaptive_exit
fi

parsed="$(do_it_adaptive_profile_parse "$path" "$CWD")"
inject=""
count=0
seen_ids=" "

while IFS=$'\t' read -r id scope stmt || [[ -n "${id:-}" ]]; do
  [[ -n "${id:-}" ]] || continue
  if [[ "$count" -ge "$_DOIT_ADAPTIVE_MAX" ]]; then
    _doit_adaptive_add_reason oversize
    continue
  fi
  case "$seen_ids" in
    *" ${id} "*)
      _doit_adaptive_add_reason duplicate-id
      continue
      ;;
  esac
  reason="$(_doit_adaptive_reason "$id" "$scope" "$stmt")"
  if [[ -n "$reason" ]]; then
    _doit_adaptive_add_reason "$reason"
    continue
  fi
  seen_ids="${seen_ids}${id} "
  count=$((count + 1))
  line="- ${id} [${scope}] ${stmt}"
  if [[ -n "$inject" ]]; then
    inject="${inject}"$'\n'"${line}"
  else
    inject="$line"
  fi
done <<< "$parsed"

text=""
if [[ -n "$inject" ]]; then
  text="do-it adaptive:"$'\n'"${inject}"
fi
if [[ -n "$_DOIT_ADAPTIVE_REASONS" ]]; then
  diag="do-it adaptive: skipped invalid Active entries (${_DOIT_ADAPTIVE_REASONS})."
  if [[ -n "$text" ]]; then
    text="${text}"$'\n'"${diag}"
  else
    text="$diag"
  fi
fi

do_it_session_state_set "$SESSION_ID" adaptive_profile_hash "$current_hash" 2>/dev/null || true

if [[ -z "$text" ]]; then
  do_it_debug adaptive-context "decision=skip reason=no-active-bullets"
  _doit_adaptive_exit
fi

do_it_debug adaptive-context "decision=inject bullets=${count} skipped=${_DOIT_ADAPTIVE_REASONS:-none}"
do_it_emit_context UserPromptSubmit "$text"
_doit_adaptive_exit
