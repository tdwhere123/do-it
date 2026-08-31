#!/usr/bin/env bash
# do-it opt-in learning event recorder (prompt-submit / slash-expansion).
#
# Default off, silent, local, fail-open. Records explicit user feedback and
# objective workflow observations (not policy). Never injects context, never
# writes adaptive profile or Core. Hosts keep invoking behavior-feedback.sh.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"
if ! declare -F do_it_runtime_event_append >/dev/null 2>&1; then
  # shellcheck source=lib/runtime-events.sh
  source "${SCRIPT_DIR}/lib/runtime-events.sh"
fi

DO_IT_LEARNING_SCHEMA="${DO_IT_LEARNING_SCHEMA:-1}"
_DO_IT_LEARNING_MAX_LINE="${DO_IT_LEARNING_MAX_LINE_BYTES:-8192}"

lr_project_root() {
  local cwd="${1:-}" root
  [[ -n "$cwd" && -d "$cwd" ]] || return 1
  root="$(do_it_git_root "$cwd")"
  [[ -n "$root" ]] || return 1
  printf '%s' "$root"
}

lr_runtime_dir() {
  local runtime
  runtime="$(do_it_runtime_root "$1")"
  [[ -n "$runtime" ]] || return 1
  printf '%s' "$runtime"
}

do_it_learning_log_path() {
  local runtime
  runtime="$(lr_runtime_dir "$1")" || return 1
  printf '%s/events/learning.jsonl' "$runtime"
}

do_it_learning_compat_log_path() {
  local runtime
  runtime="$(lr_runtime_dir "$1")" || return 1
  printf '%s/retrospective/events.jsonl' "$runtime"
}

lr_config_path() {
  local runtime
  runtime="$(lr_runtime_dir "$1")" || return 1
  printf '%s/retrospective/config.json' "$runtime"
}

lr_harvest_path() {
  local runtime
  runtime="$(lr_runtime_dir "$1")" || return 1
  printf '%s/retrospective/harvest-evidence-id' "$runtime"
}

lr_prepare_runtime() {
  local cwd="$1" runtime real_rt real_rev
  _do_it_runtime_prepare "$cwd" || return 1
  runtime="$(do_it_runtime_root "$cwd")"
  [[ -n "$runtime" ]] || return 1
  if [[ -L "${runtime}/retrospective" || -e "${runtime}/retrospective" ]]; then
    real_rt="$(_do_it_realpath "$runtime")" || return 1
    real_rev="$(_do_it_realpath "${runtime}/retrospective")" || return 1
    _do_it_path_is_under "$real_rev" "$real_rt" || return 1
  fi
  mkdir -p "${runtime}/retrospective" 2>/dev/null || return 1
  chmod 700 "${runtime}/retrospective" 2>/dev/null || true
}

lr_command() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  if [[ "$prompt_lc" =~ ^[[:space:]]*/do-it-retrospective[[:space:]]+(on|off|status|report)[[:space:]]*$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

lr_last_evidence_id() {
  local file="$1" line id
  [[ -f "$file" ]] || return 0
  [[ "${DO_IT_HAVE_JQ:-0}" == "1" ]] || return 0
  line="$(tail -n1 "$file" 2>/dev/null || true)"
  [[ -n "$line" ]] || return 0
  id="$(printf '%s' "$line" | jq -r '.event_id // empty' 2>/dev/null || true)"
  [[ "$id" != "null" ]] || id=""
  printf '%s' "$id"
}

lr_init_harvest_watermark() {
  local cwd="$1" runtime evidence harvest last
  runtime="$(lr_runtime_dir "$cwd")" || return 0
  evidence="${runtime}/events/evidence.jsonl"
  harvest="${runtime}/retrospective/harvest-evidence-id"
  last="$(lr_last_evidence_id "$evidence")"
  [[ -n "$last" ]] || return 0
  printf '%s\n' "$last" > "$harvest" 2>/dev/null || true
  chmod 600 "$harvest" 2>/dev/null || true
}

lr_set_enabled() {
  local cwd="$1" enabled="$2" runtime config tmp old_umask
  runtime="$(lr_runtime_dir "$cwd")" || return 1
  lr_prepare_runtime "$cwd" || return 1
  config="${runtime}/retrospective/config.json"

  old_umask="$(umask)"
  umask 077
  tmp="${config}.${BASHPID:-$$}.${RANDOM}.tmp"
  if ! printf '{"schema":1,"enabled":%s}\n' "$enabled" > "$tmp" 2>/dev/null; then
    umask "$old_umask"
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  if ! mv -f "$tmp" "$config" 2>/dev/null; then
    umask "$old_umask"
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  umask "$old_umask"
  chmod 600 "$config" 2>/dev/null || true
  if [[ "$enabled" == "true" ]]; then
    lr_init_harvest_watermark "$cwd"
  fi
}

do_it_learning_is_enabled() {
  local config
  config="$(lr_config_path "$1")" || return 1
  [[ -f "$config" ]] || return 1
  grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true' "$config" 2>/dev/null
}

lr_add_signal() {
  local current="$1" next="$2"
  case ",$current," in
    *,"$next",*) printf '%s' "$current" ;;
    ',,') printf '%s' "$next" ;;
    *) printf '%s,%s' "$current" "$next" ;;
  esac
}

lr_signals_from_prompt() {
  local prompt_lc signals=""
  prompt_lc="$(do_it_lc "$1")"

  case "$prompt_lc" in
    *"行为不对"*|*"行为不符合预期"*|*"行为不符合"*|*"do-it 不对"*|*"hook 不对"*)
      signals="$(lr_add_signal "$signals" behavior)"
      ;;
  esac

  if [[ "$prompt_lc" =~ (子智能体|子代理|sub[[:space:]-]?agent) ]] \
     && [[ "$prompt_lc" =~ (不怎么调用|没有调用|没调用|未调用|没有用|没用|not[[:space:]]using|didn.t[[:space:]]use|did[[:space:]]not[[:space:]]use) ]]; then
    signals="$(lr_add_signal "$signals" delegation)"
  fi

  if [[ "$prompt_lc" =~ (do-it|doit|this[[:space:]]+plugin|the[[:space:]]+plugin|plugin[[:space:]]+behavior|hook[[:space:]]+behavior|插件.*(行为|表现)|hook.*(行为|表现)) ]] \
     && [[ "$prompt_lc" =~ (不对|不符合|不应该|不该|混乱|错误|有问题|wrong|unexpected|shouldn.t|didn.t|did[[:space:]]not|not[[:space:]]what|confusing|missed) ]]; then
    signals="$(lr_add_signal "$signals" behavior)"
  fi

  [[ -n "$signals" ]] || return 1
  printf '%s' "$signals"
}

lr_redact_excerpt() {
  command -v sed >/dev/null 2>&1 || return 1
  local text
  text="$(printf '%s' "$1" | tr '\r\n\t' '   ' | LC_ALL=C sed -E \
    -e 's#```[^`]*```#[REDACTED_CODE]#g' \
    -e 's#https?://[^[:space:]"<>]+#[REDACTED_URL]#g' \
    -e 's#[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}#[REDACTED_EMAIL]#g' \
    -e 's#([A-Za-z]:\\|/)[^[:space:]"<>]*#[REDACTED_PATH]#g' \
    -e 's#eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}#[REDACTED_JWT]#g' \
    -e 's/sk-[A-Za-z0-9_-]{12,}/[REDACTED_SECRET]/g' \
    -e 's/ghp_[A-Za-z0-9]{12,}/[REDACTED_SECRET]/g' \
    -e 's/github_pat_[A-Za-z0-9_]{12,}/[REDACTED_SECRET]/g' \
    -e 's/AKIA[A-Z0-9]{12,}/[REDACTED_SECRET]/g' \
    -e 's/xox[baprs]-[A-Za-z0-9-]{12,}/[REDACTED_SECRET]/g' \
    -e 's/[Bb]earer[[:space:]]+[A-Za-z0-9._~+\\/=-]{12,}/Bearer [REDACTED_SECRET]/g' \
    -e 's/([Aa]ccess[_-]?[Tt]oken|[Rr]efresh[_-]?[Tt]oken|[Aa][Pp][Ii][_-]?[Kk]ey|[Pp]assword|[Tt]oken)[[:space:]]*[:=][[:space:]]*[^[:space:]&;,]{8,}/\1=[REDACTED_SECRET]/g' \
    | tr -s ' ')"
  if (( ${#text} > 800 )); then
    text="${text:0:800}…"
  fi
  printf '%s' "$text"
}

lr_session_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum 2>/dev/null | cut -c1-12
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 2>/dev/null | cut -c1-12
  elif command -v openssl >/dev/null 2>&1; then
    printf '%s' "$1" | openssl dgst -sha256 2>/dev/null | awk '{print substr($NF,1,12)}'
  else
    printf '%s' "$1" | _do_it_hash_key
  fi
}

lr_kind_ok() {
  case "${1:-}" in
    user_feedback|edit|evidence|completion|reminder|review|task-contract|agent-dispatch)
      return 0 ;;
  esac
  return 1
}

lr_source_ok() {
  case "${1:-}" in
    observed|user|reported|eval) return 0 ;;
  esac
  return 1
}

lr_signals_json() {
  local csv="${1:-}" item out="[" first=1
  if [[ -z "$csv" ]]; then
    printf '[]'
    return 0
  fi
  while [[ -n "$csv" ]]; do
    case "$csv" in
      *,*) item="${csv%%,*}"; csv="${csv#*,}" ;;
      *) item="$csv"; csv="" ;;
    esac
    [[ -n "$item" ]] || continue
    if [[ "$first" -eq 1 ]]; then
      out="${out}\"$(_do_it_json_escape "$item")\""
      first=0
    else
      out="${out},\"$(_do_it_json_escape "$item")\""
    fi
  done
  printf '%s]' "$out"
}

lr_build_json() {
  local event_id="$1" recorded_at="$2" kind="$3" source="$4" host="$5"
  local session_hash="$6" privacy="$7" signals_csv="$8" summary="$9" excerpt="${10:-}" task_id="${11:-}"
  local json
  json="$(printf '{"schema":%s,"event_id":"%s","recorded_at":"%s","kind":"%s","source":"%s","host":"%s","session_hash":"%s","privacy":"%s","signals":%s' \
    "$DO_IT_LEARNING_SCHEMA" \
    "$(_do_it_json_escape "$event_id")" \
    "$(_do_it_json_escape "$recorded_at")" \
    "$(_do_it_json_escape "$kind")" \
    "$(_do_it_json_escape "$source")" \
    "$(_do_it_json_escape "$host")" \
    "$(_do_it_json_escape "$session_hash")" \
    "$(_do_it_json_escape "$privacy")" \
    "$(lr_signals_json "$signals_csv")")"
  if [[ -n "$task_id" ]]; then
    json="${json}$(printf ',"task_id":"%s"' "$(_do_it_json_escape "$task_id")")"
  fi
  if [[ -n "$summary" ]]; then
    json="${json}$(printf ',"summary":"%s"' "$(_do_it_json_escape "$summary")")"
  fi
  if [[ "$privacy" == "redacted-excerpt" && -n "$excerpt" ]]; then
    json="${json}$(printf ',"prompt_excerpt":"%s"' "$(_do_it_json_escape "$excerpt")")"
  fi
  printf '%s}' "$json"
}

_lr_append_locked() {
  local learning_file="$1" compat_file="$2" line="$3"
  _do_it_jsonl_append_locked "$learning_file" "$line" || return 1
  _do_it_jsonl_append_locked "$compat_file" "$line" || true
  return 0
}

lr_last_line_dup() {
  local file="$1" kind="$2" signals_csv="$3" summary="$4" session_hash="$5"
  local last last_kind last_signals last_summary last_session
  [[ -f "$file" && "${DO_IT_HAVE_JQ:-0}" == "1" ]] || return 1
  last="$(tail -n1 "$file" 2>/dev/null || true)"
  [[ -n "$last" ]] || return 1
  last_kind="$(printf '%s' "$last" | jq -r '.kind // empty' 2>/dev/null || true)"
  last_summary="$(printf '%s' "$last" | jq -r '.summary // empty' 2>/dev/null || true)"
  last_session="$(printf '%s' "$last" | jq -r '.session_hash // .session // empty' 2>/dev/null || true)"
  last_signals="$(printf '%s' "$last" | jq -r '.signals | if type=="array" then join(",") else . end' 2>/dev/null || true)"
  [[ "$last_kind" == "$kind" && "$last_signals" == "$signals_csv" \
    && "$last_summary" == "$summary" && "$last_session" == "$session_hash" ]]
}

# Args: <cwd> <session_id> <kind> <source> <signals_csv> <summary> [excerpt]
# Always returns 0. Drops invalid/malformed rows. Never writes profile/core.
do_it_learning_record() {
  local cwd="$1" session_id="$2" kind="$3" source="$4" signals_csv="${5:-}"
  local summary="${6:-}" excerpt="${7:-}"
  local runtime learning_file compat_file session_hash recorded_at event_id
  local privacy host task_id line old_umask dedup_hash

  if ! lr_kind_ok "$kind"; then
    do_it_debug learning-recorder "decision=drop reason=invalid-kind"
    return 0
  fi
  if ! lr_source_ok "$source"; then
    do_it_debug learning-recorder "decision=drop reason=invalid-source"
    return 0
  fi
  if ! do_it_learning_is_enabled "$cwd"; then
    return 0
  fi
  lr_prepare_runtime "$cwd" || return 0
  runtime="$(lr_runtime_dir "$cwd")" || return 0
  learning_file="$(do_it_learning_log_path "$cwd")" || return 0
  compat_file="$(do_it_learning_compat_log_path "$cwd")" || return 0
  [[ -n "$runtime" && -n "$learning_file" ]] || return 0

  summary="$(_do_it_truncate_chars "$summary" 1000)"
  excerpt="$(_do_it_truncate_chars "$excerpt" 800)"
  if [[ "$kind" == "user_feedback" && -n "$excerpt" ]]; then
    privacy="redacted-excerpt"
  else
    privacy="metadata-only"
    excerpt=""
  fi

  session_hash="$(lr_session_hash "$session_id")"
  [[ -n "$session_hash" ]] || return 0
  dedup_hash="$(lr_session_hash "${kind}:${source}:${signals_csv}:${summary}:${excerpt}")"
  [[ -n "$dedup_hash" ]] || return 0
  if [[ "$(do_it_session_state_get "$session_id" learning_last_hash)" == "$dedup_hash" \
     || "$(do_it_session_state_get "$session_id" behavior_feedback_last_hash)" == "$dedup_hash" ]]; then
    do_it_debug learning-recorder "decision=skip reason=session-dedup"
    return 0
  fi
  if lr_last_line_dup "$learning_file" "$kind" "$signals_csv" "$summary" "$session_hash"; then
    do_it_debug learning-recorder "decision=skip reason=file-dedup"
    return 0
  fi

  recorded_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
  [[ -n "$recorded_at" ]] || recorded_at="1970-01-01T00:00:00Z"
  event_id="L-$(date +%s 2>/dev/null || printf 0)-${BASHPID:-$$}-${RANDOM}-${RANDOM}"
  host="$(do_it_runtime_host)"
  task_id="$(do_it_active_task_read "$cwd" 2>/dev/null || true)"

  line="$(lr_build_json "$event_id" "$recorded_at" "$kind" "$source" "$host" \
    "$session_hash" "$privacy" "$signals_csv" "$summary" "$excerpt" "$task_id")"
  if [[ "${#line}" -gt "$_DO_IT_LEARNING_MAX_LINE" && -n "$excerpt" ]]; then
    privacy="metadata-only"
    excerpt=""
    line="$(lr_build_json "$event_id" "$recorded_at" "$kind" "$source" "$host" \
      "$session_hash" "$privacy" "$signals_csv" "$summary" "$excerpt" "$task_id")"
  fi
  if [[ "${#line}" -gt "$_DO_IT_LEARNING_MAX_LINE" || -z "$line" ]]; then
    do_it_debug learning-recorder "decision=drop reason=oversize"
    return 0
  fi

  old_umask="$(umask)"
  umask 077
  if ! _do_it_with_state_lock "${runtime}/events/.learning.lock" \
      _lr_append_locked "$learning_file" "$compat_file" "$line"; then
    umask "$old_umask"
    _do_it_runtime_warn "learning recorder append failed"
    return 0
  fi
  umask "$old_umask"
  do_it_session_state_set "$session_id" learning_last_hash "$dedup_hash" || true
  do_it_session_state_set "$session_id" behavior_feedback_last_hash "$dedup_hash" || true
  do_it_debug learning-recorder "decision=recorded kind=${kind} source=${source}"
  return 0
}

lr_map_evidence_kind() {
  case "${1:-}" in
    edit) printf 'edit' ;;
    command|test|build|runtime-observation) printf 'evidence' ;;
    review) printf 'review' ;;
    completion-claim) printf 'completion' ;;
    *) printf '' ;;
  esac
}

lr_harvest_evidence() {
  local cwd="$1" session_id="$2"
  local runtime evidence harvest watermark="" saw=0 line ekind esource summary mapped signals e_id
  [[ "${DO_IT_HAVE_JQ:-0}" == "1" ]] || return 0
  runtime="$(lr_runtime_dir "$cwd")" || return 0
  evidence="${runtime}/events/evidence.jsonl"
  harvest="${runtime}/retrospective/harvest-evidence-id"
  [[ -f "$evidence" ]] || return 0
  [[ -f "$harvest" ]] && watermark="$(tr -d '\n' < "$harvest" 2>/dev/null || true)"

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    if ! printf '%s' "$line" | jq -e . >/dev/null 2>&1; then
      continue
    fi
    e_id="$(printf '%s' "$line" | jq -r '.event_id // empty' 2>/dev/null || true)"
    if [[ -n "$watermark" && "$saw" -eq 0 ]]; then
      if [[ "$e_id" == "$watermark" ]]; then
        saw=1
      fi
      continue
    fi
    ekind="$(printf '%s' "$line" | jq -r '.kind // empty' 2>/dev/null || true)"
    esource="$(printf '%s' "$line" | jq -r '.source // empty' 2>/dev/null || true)"
    summary="$(printf '%s' "$line" | jq -r '.summary // empty' 2>/dev/null || true)"
    mapped="$(lr_map_evidence_kind "$ekind")"
    [[ -n "$mapped" ]] || continue
    lr_source_ok "$esource" || esource="observed"
    signals=""
    if [[ "$mapped" == "completion" ]]; then
      signals="completion-after-edit"
    elif [[ "$mapped" == "review" ]]; then
      if printf '%s' "$summary" | grep -qiE 'block'; then
        signals="review-blocking"
      fi
    fi
    summary="$(lr_redact_excerpt "$summary" 2>/dev/null || printf '%s' "$summary")"
    do_it_learning_record "$cwd" "$session_id" "$mapped" "$esource" "$signals" "$summary" ""
  done < "$evidence"

  e_id="$(lr_last_evidence_id "$evidence")"
  if [[ -n "$e_id" ]]; then
    printf '%s\n' "$e_id" > "$harvest" 2>/dev/null || true
    chmod 600 "$harvest" 2>/dev/null || true
  fi
}

lr_learning_field() {
  local raw="$1" field="$2"
  do_it_json_get_nested "$raw" "learning.${field}"
}

lr_learning_signals() {
  local raw="$1" value=""
  if [[ "${DO_IT_HAVE_JQ:-0}" == "1" ]]; then
    value="$(printf '%s' "$raw" | jq -r '
      .learning.signals
      | if . == null then ""
        elif type == "array" then join(",")
        else .
        end
    ' 2>/dev/null || true)"
  else
    value="$(do_it_json_get_nested "$raw" learning.signals)"
  fi
  [[ "$value" == "null" ]] && value=""
  printf '%s' "$value"
}

lr_tool_kind() {
  local tool="${1:-}" t
  t="$(printf '%s' "$tool" | tr '[:upper:]' '[:lower:]')"
  case "$t" in
    edit|write|multiedit|notebookedit|strreplace|editnotebook|apply_patch|edit_file|replace)
      printf 'edit' ;;
    task|agent)
      printf 'agent-dispatch' ;;
    *)
      printf '' ;;
  esac
}

lr_basename_redacted() {
  local path="${1:-}" base
  [[ -n "$path" ]] || { printf ''; return 0; }
  base="${path##*/}"
  base="${base##*\\}"
  base="$(_do_it_truncate_chars "$base" 200)"
  printf '%s' "$base"
}

lr_event_is_stop() {
  local name
  name="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    stop|session.idle|agent_end|agent_settled|sessionidle) return 0 ;;
  esac
  return 1
}

# Observe one host payload. Always returns 0. Writes nothing when logging is off.
do_it_learning_observe_payload() {
  local raw="${1:-}" cwd="" session_id="" prompt="" transcript="" agent_id="" agent_type=""
  local hook_event="" command_name="" tool="" file_path=""
  local l_kind="" l_source="" l_signals="" l_summary="" signals="" excerpt="" mapped="" base="" runtime="" evidence=""

  if [[ -z "$raw" ]]; then
    return 0
  fi

  session_id="$(do_it_json_get "$raw" session_id)"
  [[ -n "$session_id" ]] || session_id="$(do_it_json_get "$raw" conversation_id)"
  prompt="$(do_it_json_get_prompt "$raw")"
  cwd="$(do_it_json_get "$raw" cwd)"
  transcript="$(do_it_json_get "$raw" transcript_path)"
  agent_id="$(do_it_json_get "$raw" agent_id)"
  agent_type="$(do_it_json_get "$raw" agent_type)"
  hook_event="$(do_it_json_get "$raw" hook_event_name)"
  [[ -n "$hook_event" ]] || hook_event="$(do_it_json_get "$raw" event)"
  command_name="$(do_it_json_get "$raw" command_name)"
  tool="$(do_it_json_get "$raw" tool_name)"
  [[ -n "$tool" ]] || tool="$(do_it_json_get "$raw" tool)"
  file_path="$(do_it_json_get_nested "$raw" tool_input.file_path)"
  [[ -n "$file_path" ]] || file_path="$(do_it_json_get "$raw" file_path)"

  if [[ -z "$cwd" && -n "$file_path" ]]; then
    cwd="${file_path%/*}"
  fi

  if [[ -n "$agent_id" || -n "$agent_type" ]] || do_it_in_subagent_context "$transcript"; then
    do_it_debug learning-recorder "decision=skip reason=subagent"
    return 0
  fi
  if [[ "$hook_event" == "UserPromptExpansion" && "$command_name" != "do-it-retrospective" ]]; then
    return 0
  fi

  case "$(lr_command "$prompt")" in
    on)
      lr_set_enabled "$cwd" true || true
      return 0
      ;;
    off)
      lr_set_enabled "$cwd" false || true
      return 0
      ;;
    status|report)
      return 0
      ;;
  esac

  [[ -n "$cwd" ]] || return 0
  if ! do_it_learning_is_enabled "$cwd"; then
    return 0
  fi

  l_kind="$(lr_learning_field "$raw" kind)"
  [[ "$l_kind" == "null" ]] && l_kind=""
  if [[ -n "$l_kind" ]]; then
    l_source="$(lr_learning_field "$raw" source)"
    [[ "$l_source" == "null" ]] && l_source=""
    [[ -n "$l_source" ]] || l_source="observed"
    l_signals="$(lr_learning_signals "$raw")"
    l_summary="$(lr_learning_field "$raw" summary)"
    [[ "$l_summary" == "null" ]] && l_summary=""
    [[ -n "$l_summary" ]] || l_summary="observed ${l_kind}"
    l_summary="$(lr_redact_excerpt "$l_summary" 2>/dev/null || printf '%s' "$l_summary")"
    do_it_learning_record "$cwd" "$session_id" "$l_kind" "$l_source" "$l_signals" "$l_summary" ""
    return 0
  fi

  if signals="$(lr_signals_from_prompt "$prompt")"; then
    excerpt="$(lr_redact_excerpt "$prompt")" || excerpt=""
    if [[ -n "$excerpt" ]]; then
      do_it_learning_record "$cwd" "$session_id" user_feedback user "$signals" \
        "explicit user feedback" "$excerpt"
    fi
  fi

  mapped="$(lr_tool_kind "$tool")"
  if [[ "$mapped" == "edit" ]]; then
    base="$(lr_basename_redacted "$file_path")"
    if [[ -n "$base" ]]; then
      l_summary="edit ${base}"
    else
      l_summary="edit"
    fi
    do_it_learning_record "$cwd" "$session_id" edit observed "" "$l_summary" ""
  elif [[ "$mapped" == "agent-dispatch" ]]; then
    do_it_learning_record "$cwd" "$session_id" agent-dispatch observed "" \
      "agent dispatch observed" ""
  fi

  if lr_event_is_stop "$hook_event"; then
    runtime="$(lr_runtime_dir "$cwd" 2>/dev/null || true)"
    evidence="${runtime}/events/evidence.jsonl"
    if [[ -n "$runtime" && -f "$evidence" ]] \
       && grep -Eq '"kind"[[:space:]]*:[[:space:]]*"(edit|completion-claim)"' "$evidence" 2>/dev/null; then
      do_it_learning_record "$cwd" "$session_id" completion observed \
        "completion-after-edit" "Completion language followed edits." ""
    fi
  fi

  case "$hook_event" in
    UserPromptSubmit|UserPromptExpansion|"")
      lr_harvest_evidence "$cwd" "$session_id"
      ;;
  esac
  return 0
}

lr_normalize_kind() {
  case "${1:-}" in
    behavior-feedback) printf 'user_feedback' ;;
    verification-reminder) printf 'reminder' ;;
    *) printf '%s' "$1" ;;
  esac
}

lr_iter_log_lines() {
  local learning="$1" compat="$2"
  if [[ -f "$learning" ]]; then
    cat "$learning"
  fi
  if [[ -f "$compat" && "$compat" != "$learning" ]]; then
    cat "$compat"
  fi
}

# Print a retrospective v2 report for cwd. Does not write profile, Core, or the log.
do_it_learning_report_text() {
  local cwd="${1:-.}"
  local learning="" compat="" config="" enabled="disabled"
  local valid=0 skipped=0 line kind signals
  local tmp counts="" repeated="" action="no-action" candidates="" gaps=""
  local kinds="" first="" last="" item count candidate_n=0 event_id="" seen_ids=""

  learning="$(do_it_learning_log_path "$cwd" 2>/dev/null || true)"
  compat="$(do_it_learning_compat_log_path "$cwd" 2>/dev/null || true)"
  config="$(lr_config_path "$cwd" 2>/dev/null || true)"
  if [[ -n "$config" ]] && grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true' "$config" 2>/dev/null; then
    enabled="enabled"
  fi

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/do-it-learning-report.XXXXXX")" || tmp=""
  if [[ -z "$tmp" ]]; then
    printf '%s\n' "Recorder / observability"
    printf '%s\n' "- Recorder: ${enabled}; valid=0 skipped=0"
    printf '%s\n' "Recommended action: no-action"
    return 0
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -n "$line" ]] || continue
    if [[ "${DO_IT_HAVE_JQ:-0}" != "1" ]] || ! printf '%s' "$line" | jq -e . >/dev/null 2>&1; then
      skipped=$((skipped + 1))
      continue
    fi
    kind="$(printf '%s' "$line" | jq -r '.kind // empty' 2>/dev/null || true)"
    kind="$(lr_normalize_kind "$kind")"
    if ! lr_kind_ok "$kind"; then
      skipped=$((skipped + 1))
      continue
    fi
    event_id="$(printf '%s' "$line" | jq -r '.event_id // empty' 2>/dev/null || true)"
    if [[ -n "$event_id" ]]; then
      case ",$seen_ids," in
        *",$event_id,"*) continue ;;
      esac
      seen_ids="${seen_ids:+$seen_ids,}$event_id"
    fi
    signals="$(printf '%s' "$line" | jq -r '.signals | if type=="array" then join(",") elif type=="string" then . else empty end' 2>/dev/null || true)"
    valid=$((valid + 1))
    kinds="$(lr_add_signal "$kinds" "$kind")"
    [[ -n "$first" ]] || first="$(printf '%s' "$line" | jq -r '.recorded_at // empty' 2>/dev/null || true)"
    last="$(printf '%s' "$line" | jq -r '.recorded_at // empty' 2>/dev/null || true)"
    while [[ -n "$signals" ]]; do
      case "$signals" in
        *,*) item="${signals%%,*}"; signals="${signals#*,}" ;;
        *) item="$signals"; signals="" ;;
      esac
      [[ -n "$item" ]] || continue
      printf '%s\n' "$item" >> "${tmp}/signals"
    done
  done < <(lr_iter_log_lines "$learning" "$compat")

  if [[ -f "${tmp}/signals" ]]; then
    counts="$(sort "${tmp}/signals" | uniq -c | sort -nr)"
  fi

  gaps="none"
  if [[ ! -f "${cwd}/.do-it/runtime/events/evidence.jsonl" && ! -f "$(lr_runtime_dir "$cwd" 2>/dev/null)/events/evidence.jsonl" ]]; then
    case ",$kinds," in
      *,edit,*|*,completion,*|*,review,*|*,evidence,*) ;;
      *) gaps="scope-creep, completion-after-edit, review-blocking not visible on this host payload" ;;
    esac
  fi

  if [[ "$valid" -le 1 ]]; then
    action="no-action"
  else
    if printf '%s\n' "$counts" | grep -q 'completion-after-edit\|no-fresh-evidence'; then
      action="code/test fix"
    elif printf '%s\n' "$counts" | grep -q 'task-contract\|scope-creep'; then
      action="task-contract fix"
    elif printf '%s\n' "$counts" | grep -q 'observability-gap'; then
      action="host gap"
    elif printf '%s\n' "$counts" | grep -q 'behavior\|delegation'; then
      action="adaptive candidate"
    elif printf '%s\n' "$counts" | grep -q 'review-blocking'; then
      action="code/test fix"
    else
      action="no-action"
    fi
  fi

  if [[ "$valid" -gt 1 && -n "$counts" ]]; then
    while IFS= read -r row; do
      [[ -n "$row" ]] || continue
      count="$(printf '%s' "$row" | awk '{print $1}')"
      item="$(printf '%s' "$row" | awk '{print $2}')"
      [[ "${count:-0}" -ge 2 && -n "$item" ]] || continue
      candidate_n=$((candidate_n + 1))
      [[ "$candidate_n" -le 3 ]] || break
      candidates="${candidates}- ${item} (n=${count}) → observation only, not active policy"$'\n'
    done <<< "$counts"
  fi
  [[ -n "$candidates" ]] || candidates="- none (single or unrepeated observations stay no-action)"$'\n'

  if [[ -n "$counts" ]]; then
    repeated="$(printf '%s\n' "$counts" | awk '$1>=2 {printf "- %s (%s)\n", $2, $1}')"
  fi
  [[ -n "$repeated" ]] || repeated="- none"

  printf '%s\n' "Recorder / observability"
  printf '%s\n' "- Recorder: ${enabled}; valid=${valid} skipped=${skipped}; range ${first:-none} .. ${last:-none}"
  printf '%s\n' "Event coverage and gaps"
  printf '%s\n' "- kinds: ${kinds:-none}"
  printf '%s\n' "- gaps: ${gaps}"
  printf '%s\n' "Repeated failure signals"
  printf '%s\n' "$repeated"
  printf '%s\n' "Candidate policies (max 3)"
  printf '%s' "$candidates"
  printf '%s\n' "Counterexamples / competing causes"
  printf '%s\n' "- prefer a hook/test/doc fix over a new prompt rule"
  printf '%s\n' "- do not treat one incident as a durable policy"
  printf '%s\n' "Recommended action: ${action}"
  printf '%s\n' "Evidence still missing"
  printf '%s\n' "- recurrence across independent tasks; targeted eval before any Active delta"
  printf '%s\n' "- report does not write adaptive profile or Core"

  rm -rf "$tmp" 2>/dev/null || true
  return 0
}

_do_it_learning_recorder_main() {
  local raw
  raw="$(do_it_read_stdin)"
  do_it_learning_observe_payload "$raw"
  exit 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  _do_it_learning_recorder_main
fi
