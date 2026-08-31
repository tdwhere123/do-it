#!/usr/bin/env bash
# Evidence event ledger. Source from hook libraries.
# Append is fail-open: lock/umask/rotation failures emit one diagnostic and
# still return 0. Observed rows are candidates, never auto-proof.

set -uo pipefail

_DO_IT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -F do_it_runtime_root >/dev/null 2>&1; then
  # shellcheck source=task-state.sh
  source "${_DO_IT_LIB_DIR}/task-state.sh"
fi
if ! declare -F do_it_worktree_fingerprint >/dev/null 2>&1; then
  # shellcheck source=worktree-fingerprint.sh
  source "${_DO_IT_LIB_DIR}/worktree-fingerprint.sh"
fi

DO_IT_RUNTIME_EVENT_SCHEMA="${DO_IT_RUNTIME_EVENT_SCHEMA:-1}"

do_it_evidence_log_path() {
  local runtime
  runtime="$(do_it_runtime_root "${1:-.}")"
  [[ -n "$runtime" ]] || return 0
  printf '%s/events/evidence.jsonl' "$runtime"
}

do_it_runtime_host() {
  if [[ -n "${DO_IT_EVENT_HOST:-}" ]]; then
    printf '%s' "$DO_IT_EVENT_HOST"
    return 0
  fi
  if [[ -n "${CURSOR_PLUGIN_ROOT:-}" || -n "${CURSOR_VERSION:-}" ]]; then
    printf 'cursor'
  elif [[ -n "${OPENCODE_DATA:-}" ]]; then
    printf 'opencode'
  elif [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    printf 'claude'
  elif [[ -n "${KIMI_PLUGIN_ROOT:-}" || -n "${KIMI_CODE_HOME:-}" ]]; then
    printf 'kimi'
  elif [[ -n "${PLUGIN_ROOT:-}" || -n "${CODEX_HOME:-}" ]]; then
    printf 'codex'
  else
    printf 'unknown'
  fi
}

_do_it_event_kind_ok() {
  case "${1:-}" in
    edit|command|test|build|runtime-observation|review|completion-claim) return 0 ;;
  esac
  return 1
}

_do_it_event_source_ok() {
  case "${1:-}" in
    observed|reported|user|eval) return 0 ;;
  esac
  return 1
}

_do_it_truncate_chars() {
  local s="${1:-}" max="${2:-1000}"
  if [[ "${#s}" -gt "$max" ]]; then
    printf '%s' "${s:0:max}"
  else
    printf '%s' "$s"
  fi
}

_do_it_event_worktree_json() {
  local cwd="${1:-.}" wt
  wt="$(do_it_worktree_fingerprint "$cwd" 2>/dev/null | head -n1 || true)"
  case "$wt" in
    \{*) printf '%s' "$wt" ;;
    *) printf '%s' '{"head":null,"fingerprint":null,"coverage":"unavailable","observed_epoch":null}' ;;
  esac
}

_do_it_event_build_json() {
  local event_id="$1" recorded_at="$2" kind="$3" source="$4" host="$5" summary="$6" worktree="$7"
  local json
  json="$(printf '{"schema":%s,"event_id":"%s","recorded_at":"%s","kind":"%s","source":"%s","host":"%s"' \
    "$DO_IT_RUNTIME_EVENT_SCHEMA" \
    "$(_do_it_json_escape "$event_id")" \
    "$(_do_it_json_escape "$recorded_at")" \
    "$(_do_it_json_escape "$kind")" \
    "$(_do_it_json_escape "$source")" \
    "$(_do_it_json_escape "$host")")"
  if [[ -n "${DO_IT_EVENT_TASK_ID:-}" ]]; then
    json="${json}$(printf ',"task_id":"%s"' "$(_do_it_json_escape "$DO_IT_EVENT_TASK_ID")")"
  fi
  if [[ -n "${DO_IT_EVENT_ACCEPTANCE_HINT:-}" ]]; then
    json="${json}$(printf ',"acceptance_hint":"%s"' "$(_do_it_json_escape "$DO_IT_EVENT_ACCEPTANCE_HINT")")"
  fi
  if [[ -n "${DO_IT_EVENT_COMMAND:-}" ]]; then
    json="${json}$(printf ',"command":"%s"' \
      "$(_do_it_json_escape "$(_do_it_truncate_chars "$DO_IT_EVENT_COMMAND" 500)")")"
  fi
  if [[ -n "${DO_IT_EVENT_EXIT_CODE:-}" ]]; then
    case "${DO_IT_EVENT_EXIT_CODE}" in
      ''|*[!0-9-]*) ;;
      *) json="${json}$(printf ',"exit_code":%s' "$DO_IT_EVENT_EXIT_CODE")" ;;
    esac
  fi
  if [[ -n "$summary" ]]; then
    json="${json}$(printf ',"summary":"%s"' "$(_do_it_json_escape "$summary")")"
  fi
  printf '%s,"worktree":%s}' "$json" "$worktree"
}

_do_it_jsonl_rotate_locked() {
  local file="$1"
  local max="${DO_IT_EVENTS_MAX_BYTES:-1048576}"
  local keep="${DO_IT_EVENTS_ROTATE_KEEP:-3}"
  local size i
  [[ -f "$file" ]] || return 0
  size="$(wc -c < "$file" 2>/dev/null | tr -d ' ')"
  [[ "${size:-0}" -ge "$max" ]] || return 0
  rm -f "${file}.${keep}" 2>/dev/null || true
  i=$((keep - 1))
  while [[ "$i" -ge 1 ]]; do
    if [[ -f "${file}.${i}" ]]; then
      mv -f "${file}.${i}" "${file}.$((i + 1))" 2>/dev/null || true
    fi
    i=$((i - 1))
  done
  mv -f "$file" "${file}.1" 2>/dev/null || true
}

_do_it_jsonl_append_locked() {
  local file="$1" line="$2"
  _do_it_jsonl_rotate_locked "$file"
  mkdir -p "$(dirname "$file")" 2>/dev/null || return 1
  printf '%s\n' "$line" >> "$file" 2>/dev/null || return 1
  chmod 600 "$file" 2>/dev/null || true
}

# Args: <kind> <source> [summary] [cwd]
# Optional env: DO_IT_EVENT_HOST, DO_IT_EVENT_COMMAND, DO_IT_EVENT_EXIT_CODE,
#   DO_IT_EVENT_TASK_ID, DO_IT_EVENT_ACCEPTANCE_HINT.
# Always returns 0. Observed evidence is not auto-proof.
do_it_runtime_event_append() {
  local kind="${1:-}" source="${2:-}" summary="${3:-}" cwd="${4:-.}"
  local runtime file line max_line recorded_at event_id host worktree old_umask

  if ! _do_it_event_kind_ok "$kind"; then
    _do_it_runtime_warn "ignored invalid evidence kind"
    return 0
  fi
  if ! _do_it_event_source_ok "$source"; then
    _do_it_runtime_warn "ignored invalid evidence source"
    return 0
  fi
  if ! _do_it_runtime_prepare "$cwd"; then
    _do_it_runtime_warn "runtime event append failed"
    return 0
  fi
  runtime="$(do_it_runtime_root "$cwd")"
  file="$(do_it_evidence_log_path "$cwd")"
  if [[ -z "$runtime" || -z "$file" ]]; then
    _do_it_runtime_warn "runtime event append failed"
    return 0
  fi

  summary="$(_do_it_truncate_chars "$summary" 1000)"
  recorded_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
  [[ -n "$recorded_at" ]] || recorded_at="1970-01-01T00:00:00Z"
  event_id="E-$(date +%s 2>/dev/null || printf 0)-${BASHPID:-$$}-${RANDOM}-${RANDOM}"
  host="$(do_it_runtime_host)"
  worktree="$(_do_it_event_worktree_json "$cwd")"
  line="$(_do_it_event_build_json "$event_id" "$recorded_at" "$kind" "$source" "$host" "$summary" "$worktree")"
  max_line="${DO_IT_EVENTS_MAX_LINE_BYTES:-8192}"
  if [[ "${#line}" -gt "$max_line" ]]; then
    summary=""
    line="$(_do_it_event_build_json "$event_id" "$recorded_at" "$kind" "$source" "$host" "$summary" "$worktree")"
  fi
  if [[ "${#line}" -gt "$max_line" || -z "$line" ]]; then
    _do_it_runtime_warn "runtime event append failed"
    return 0
  fi

  old_umask="$(umask)"
  umask 077
  if ! _do_it_with_state_lock "${runtime}/events/.evidence.lock" \
      _do_it_jsonl_append_locked "$file" "$line"; then
    umask "$old_umask"
    _do_it_runtime_warn "runtime event append failed"
    return 0
  fi
  umask "$old_umask"
  return 0
}
