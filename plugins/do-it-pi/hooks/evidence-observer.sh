#!/usr/bin/env bash
# do-it evidence observer (PostToolUse / tool_result).
#
# Normalize edit / shell / test / build / tool results into canonical evidence
# events via do_it_runtime_event_append. Bounded summary/digest only. Fail-open.
# Never auto-maps A-IDs and never emits VERIFIED. Source this file for
# freshness helpers; the main path runs only when executed as a hook.

set -uo pipefail

_DO_IT_EVIDENCE_OBSERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -F do_it_read_stdin >/dev/null 2>&1; then
  # shellcheck source=lib/common.sh
  source "${_DO_IT_EVIDENCE_OBSERVER_DIR}/lib/common.sh"
fi
if ! declare -F do_it_debug >/dev/null 2>&1; then
  # shellcheck source=lib/debug.sh
  source "${_DO_IT_EVIDENCE_OBSERVER_DIR}/lib/debug.sh"
fi
if ! declare -F do_it_runtime_event_append >/dev/null 2>&1; then
  # shellcheck source=lib/runtime-events.sh
  source "${_DO_IT_EVIDENCE_OBSERVER_DIR}/lib/runtime-events.sh"
fi

do_it_evidence_mode_off() {
  case "${DO_IT_EVIDENCE_MODE:-observe}" in
    off|OFF|0|false|FALSE) return 0 ;;
  esac
  return 1
}

# Classify a shell command into test|build|command. Never maps to A-IDs.
do_it_evidence_classify_command() {
  local low
  low="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  if printf '%s' "$low" | grep -E \
    '(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?test\b|npm[[:space:]]+t\b|(^|[[:space:]])(pytest|vitest|jest|mocha)([[:space:]]|$)|cargo[[:space:]]+test\b|go[[:space:]]+test\b|node[[:space:]]+--test\b|make[[:space:]]+test\b' \
    >/dev/null 2>&1; then
    printf 'test'
    return 0
  fi
  if printf '%s' "$low" | grep -E \
    '(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?build\b|cargo[[:space:]]+build\b|go[[:space:]]+build\b|(^|[[:space:]])tsc([[:space:]]|$)|make[[:space:]]+(all|build)\b|^make$' \
    >/dev/null 2>&1; then
    printf 'build'
    return 0
  fi
  printf 'command'
}

# Classify a host tool name + command into edit|test|build|command|skip.
do_it_evidence_classify_tool() {
  local tool="${1:-}" command="${2:-}" file_path="${3:-}" t
  t="$(printf '%s' "$tool" | tr '[:upper:]' '[:lower:]')"
  case "$t" in
    edit|write|multiedit|notebookedit|strreplace|editnotebook|apply_patch|edit_file|replace)
      printf 'edit'
      return 0
      ;;
    bash|shell|powershell|cmd|command|bashtool)
      do_it_evidence_classify_command "$command"
      return 0
      ;;
  esac
  if [[ -n "$command" ]]; then
    do_it_evidence_classify_command "$command"
    return 0
  fi
  if [[ -z "$t" && -n "$file_path" ]]; then
    printf 'edit'
    return 0
  fi
  printf 'skip'
}

_do_it_observer_scalar() {
  local raw="$1" pathspec="$2" value=""
  value="$(do_it_json_get_nested "$raw" "$pathspec")"
  if [[ -z "$value" || "$value" == "null" ]]; then
    printf ''
    return 0
  fi
  printf '%s' "$value"
}

_do_it_observer_first() {
  local raw="$1" pathspec value
  shift
  for pathspec in "$@"; do
    value="$(_do_it_observer_scalar "$raw" "$pathspec")"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  printf ''
}

_do_it_observer_exit_code() {
  local raw="$1" v
  v="$(_do_it_observer_first "$raw" \
    tool_response.exit_code tool_response.exitCode \
    tool_response.metadata.exit_code tool_response.metadata.exitCode \
    tool_response.returncode exit_code exitCode)"
  case "$v" in
    ''|*[!0-9-]*) printf '' ;;
    *) printf '%s' "$v" ;;
  esac
}

_do_it_observer_output() {
  local raw="$1" out=""
  if [[ "${DO_IT_HAVE_JQ:-0}" == "1" ]]; then
    out="$(printf '%s' "$raw" | jq -r '
      [
        .tool_response.stdout,
        .tool_response.output,
        .tool_result,
        .tool_output,
        .output
      ]
      | map(select(type == "string" and length > 0) | .[0:8000])
      | .[0] // ""
    ' 2>/dev/null || true)"
  else
    out="$(_do_it_observer_first "$raw" \
      tool_response.stdout tool_response.output tool_result tool_output output)"
    out="${out:0:8000}"
  fi
  printf '%s' "$out"
}

_do_it_observer_digest() {
  local output="$1" digest
  digest="$(printf '%s' "$output" | _do_it_sha256_hex)"
  digest="${digest:0:16}"
  printf '%s' "${digest:-unavailable}"
}

_do_it_observer_command_summary() {
  local exit_code="$1" output="$2" summary=""
  if [[ -n "$exit_code" ]]; then
    summary="exit=${exit_code}"
  else
    summary="exit unavailable"
  fi
  if [[ -n "$output" ]]; then
    summary="${summary}; digest=$(_do_it_observer_digest "$output") bytes=${#output}"
  else
    summary="${summary}; output unavailable"
  fi
  printf '%s' "$summary"
}

_do_it_observer_edit_summary() {
  local file_path="$1" base
  if [[ -z "$file_path" ]]; then
    printf 'edit'
    return 0
  fi
  base="${file_path##*/}"
  base="$(_do_it_truncate_chars "$base" 200)"
  printf 'edit %s' "$base"
}

_do_it_observer_clear_event_env() {
  unset DO_IT_EVENT_ACCEPTANCE_HINT
  unset DO_IT_EVENT_COMMAND
  unset DO_IT_EVENT_EXIT_CODE
  unset DO_IT_EVENT_TASK_ID
  unset DO_IT_EVENT_FORCE_COVERAGE
}

# When a command/test/build payload has no reliable exit, do not keep a
# complete fingerprint coverage. Gaps stay partial/unavailable, never complete.
_do_it_event_worktree_json() {
  local cwd="${1:-.}" wt current
  wt="$(do_it_worktree_fingerprint "$cwd" 2>/dev/null | head -n1 || true)"
  case "$wt" in
    \{*) ;;
    *) wt='{"head":null,"fingerprint":null,"coverage":"unavailable","observed_epoch":null}' ;;
  esac
  if [[ -n "${DO_IT_EVENT_FORCE_COVERAGE:-}" && "${DO_IT_HAVE_JQ:-0}" == "1" ]]; then
    current="$(printf '%s' "$wt" | jq -r '.coverage // "unavailable"' 2>/dev/null || true)"
    if [[ "$current" == "complete" ]]; then
      wt="$(printf '%s' "$wt" | jq -c --arg c "$DO_IT_EVENT_FORCE_COVERAGE" '.coverage=$c' 2>/dev/null || true)"
      [[ -n "$wt" ]] || wt='{"head":null,"fingerprint":null,"coverage":"unavailable","observed_epoch":null}'
    fi
  fi
  printf '%s' "$wt"
}

_do_it_observer_session_id() {
  _do_it_observer_first "$1" session_id conversation_id generation_id
}

# Cursor postToolUse and afterFileEdit can fire for the same write. Skip a
# consecutive edit of the same file when the fingerprint has not moved.
_do_it_observer_edit_deduped() {
  local cwd="$1" file_path="$2" log="" last="" last_kind="" last_summary=""
  local expected="" current="" last_fp=""
  log="$(do_it_evidence_log_path "$cwd" 2>/dev/null || true)"
  [[ -n "$log" && -f "$log" ]] || return 1
  last="$(tail -n1 "$log" 2>/dev/null || true)"
  [[ -n "$last" ]] || return 1
  if [[ "${DO_IT_HAVE_JQ:-0}" != "1" ]]; then
    return 1
  fi
  last_kind="$(printf '%s' "$last" | jq -r '.kind // ""' 2>/dev/null || true)"
  [[ "$last_kind" == "edit" ]] || return 1
  expected="$(_do_it_observer_edit_summary "$file_path")"
  last_summary="$(printf '%s' "$last" | jq -r '.summary // ""' 2>/dev/null || true)"
  [[ "$last_summary" == "$expected" ]] || return 1
  last_fp="$(printf '%s' "$last" | jq -r '.worktree.fingerprint // empty' 2>/dev/null || true)"
  [[ -n "$last_fp" && "$last_fp" != "null" ]] || return 1
  current="$(do_it_worktree_fingerprint "$cwd" 2>/dev/null | head -n1 || true)"
  current="$(printf '%s' "$current" | jq -r '.fingerprint // empty' 2>/dev/null || true)"
  [[ -n "$current" && "$current" == "$last_fp" ]] || return 1
  return 0
}

# Freshness of observed candidates vs this worktree. Always prints one JSON
# object and returns 0. status: fresh|stale|none|malformed. Never proof.
do_it_evidence_freshness() {
  local cwd="${1:-.}" active="" log="" current="" json
  active="$(do_it_active_task_read "$cwd" 2>/dev/null || true)"
  log="$(do_it_evidence_log_path "$cwd" 2>/dev/null || true)"
  current="$(do_it_worktree_fingerprint "$cwd" 2>/dev/null | head -n1 || true)"
  case "$current" in
    \{*) ;;
    *) current='{"head":null,"fingerprint":null,"coverage":"unavailable","observed_epoch":null}' ;;
  esac

  if [[ -z "$log" || ! -f "$log" ]]; then
    printf '{"status":"none","reason":"no-ledger","diagnostic":"","active_task":"%s"}\n' \
      "$(_do_it_json_escape "$active")"
    return 0
  fi
  if [[ ! -s "$log" ]]; then
    printf '{"status":"none","reason":"no-candidates","diagnostic":"","active_task":"%s"}\n' \
      "$(_do_it_json_escape "$active")"
    return 0
  fi

  if [[ "${DO_IT_HAVE_JQ:-0}" != "1" ]]; then
    printf '{"status":"none","reason":"jq-unavailable","diagnostic":"","active_task":"%s"}\n' \
      "$(_do_it_json_escape "$active")"
    return 0
  fi

  if ! jq -s -e . "$log" >/dev/null 2>&1; then
    printf '{"status":"malformed","reason":"unreadable","diagnostic":"Evidence ledger was unreadable.","active_task":"%s"}\n' \
      "$(_do_it_json_escape "$active")"
    return 0
  fi

  json="$(jq -s -c --argjson current "$current" --arg active "$active" '
    def cand($e):
      $e.kind == "command" or $e.kind == "test" or $e.kind == "build"
      or $e.kind == "runtime-observation" or $e.kind == "review";
    def complete($w):
      ($w.coverage // "") == "complete"
      and ($w.head | type) == "string" and ($w.head | length) > 0
      and ($w.fingerprint | type) == "string" and ($w.fingerprint | length) > 0;
    . as $rows
    | ($rows | length) as $n
    | [range(0; $n) | select($rows[.].kind == "edit")] as $edits
    | (if ($edits | length) > 0 then $edits[-1] else -1 end) as $last_edit
    | (
        if $last_edit < 0 then [range(0; $n) | select(cand($rows[.]))]
        else [range($last_edit + 1; $n) | select(cand($rows[.]))]
        end
      ) as $after
    | (if ($after | length) > 0 then $rows[$after[-1]] else null end) as $cand
    | if ($current.coverage // "") != "complete" or (complete($current) | not) then
        {status:"stale", reason:"current-incomplete", diagnostic:"", active_task:$active}
      elif $last_edit >= 0 and ($after | length) == 0 then
        {status:"stale", reason:"edit-after-evidence", diagnostic:"", active_task:$active}
      elif $cand == null then
        {status:"none", reason:"no-candidates", diagnostic:"", active_task:$active}
      elif (($cand.worktree.head // null) != ($current.head // null)) then
        {status:"stale", reason:"head-mismatch", diagnostic:"", active_task:$active}
      elif (($cand.worktree.fingerprint // null) != ($current.fingerprint // null)) then
        {status:"stale", reason:"fingerprint-mismatch", diagnostic:"", active_task:$active}
      elif ($cand.worktree.coverage // "") != "complete" then
        {status:"stale", reason:"partial", diagnostic:"", active_task:$active}
      else
        {status:"fresh", reason:"after-edit", diagnostic:"", active_task:$active}
      end
  ' "$log" 2>/dev/null || true)"

  if [[ -z "$json" ]]; then
    printf '{"status":"malformed","reason":"unreadable","diagnostic":"Evidence ledger was unreadable.","active_task":"%s"}\n' \
      "$(_do_it_json_escape "$active")"
    return 0
  fi
  printf '%s\n' "$json"
  return 0
}

# Record one host payload as an evidence candidate. Always returns 0.
do_it_evidence_observe_payload() {
  local raw="${1:-}" cwd="${2:-}" kind="" tool="" command="" file_path=""
  local output="" exit_code="" summary="" task=""

  _do_it_observer_clear_event_env

  if do_it_evidence_mode_off; then
    do_it_debug evidence-observer "decision=skip reason=mode-off"
    return 0
  fi
  if [[ -z "$raw" ]]; then
    _do_it_runtime_warn "evidence observer: empty payload"
    return 0
  fi
  if [[ "${DO_IT_HAVE_JQ:-0}" == "1" ]]; then
    if [[ "$(printf '%s' "$raw" | jq -r 'type' 2>/dev/null || true)" != "object" ]]; then
      _do_it_runtime_warn "evidence observer: payload is not JSON"
      return 0
    fi
  else
    case "$raw" in
      \{*) ;;
      *)
        _do_it_runtime_warn "evidence observer: payload is not JSON"
        return 0
        ;;
    esac
  fi

  if [[ -z "$cwd" ]]; then
    cwd="$(_do_it_observer_scalar "$raw" cwd)"
  fi
  tool="$(_do_it_observer_first "$raw" tool_name tool)"
  command="$(_do_it_observer_first "$raw" tool_input.command command)"
  file_path="$(_do_it_observer_first "$raw" \
    tool_input.file_path tool_input.path file_path path filePath)"
  if [[ -z "$cwd" && -n "$file_path" ]]; then
    cwd="${file_path%/*}"
  fi
  if [[ -z "$cwd" ]]; then
    _do_it_runtime_warn "evidence observer: cwd unavailable"
    return 0
  fi

  kind="$(do_it_evidence_classify_tool "$tool" "$command" "$file_path")"
  if [[ "$kind" == "skip" ]]; then
    do_it_debug evidence-observer "decision=skip reason=tool-out-of-scope tool=${tool}"
    return 0
  fi

  task="$(do_it_active_task_read "$cwd" 2>/dev/null || true)"
  if [[ -n "$task" ]]; then
    export DO_IT_EVENT_TASK_ID="$task"
  fi

  if [[ "$kind" == "edit" ]]; then
    if _do_it_observer_edit_deduped "$cwd" "$file_path"; then
      do_it_debug evidence-observer "decision=skip reason=edit-dedup"
      _do_it_observer_clear_event_env
      return 0
    fi
    do_it_observed_epoch_bump "$cwd" >/dev/null 2>&1 || true
    summary="$(_do_it_observer_edit_summary "$file_path")"
    do_it_runtime_event_append edit observed "$summary" "$cwd"
    do_it_debug evidence-observer "decision=recorded kind=edit"
    _do_it_observer_clear_event_env
    return 0
  fi

  exit_code="$(_do_it_observer_exit_code "$raw")"
  output="$(_do_it_observer_output "$raw")"
  summary="$(_do_it_observer_command_summary "$exit_code" "$output")"
  if [[ -n "$command" ]]; then
    export DO_IT_EVENT_COMMAND="$command"
  fi
  if [[ -n "$exit_code" ]]; then
    export DO_IT_EVENT_EXIT_CODE="$exit_code"
  else
    # No reliable shell result: record the fact as partial, never complete.
    export DO_IT_EVENT_FORCE_COVERAGE=partial
  fi
  do_it_runtime_event_append "$kind" observed "$summary" "$cwd"
  do_it_debug evidence-observer "decision=recorded kind=${kind}"
  _do_it_observer_clear_event_env
  return 0
}

_do_it_evidence_observer_main() {
  local raw session_id
  raw="$(do_it_read_stdin)"
  session_id="$(_do_it_observer_session_id "$raw")"
  do_it_session_state_inc "$session_id" hook_invocations evidence_observer
  do_it_evidence_observe_payload "$raw"
  exit 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  _do_it_evidence_observer_main
fi
