#!/usr/bin/env bash
# do-it opt-in behavioral feedback recorder (prompt-submit / slash-expansion).
#
# The recorder is intentionally silent and disabled by default. An exact
# `/do-it-retrospective on` creates a project-local, gitignored control file;
# later explicit feedback is stored as a redacted, bounded JSONL excerpt for a
# user-invoked retrospective. It never injects context or changes model flow.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=lib/debug.sh
source "${SCRIPT_DIR}/lib/debug.sh"

bf_project_root() {
  local cwd="${1:-}" resolved root
  [[ -n "$cwd" && -d "$cwd" ]] || return 1
  resolved="$(cd "$cwd" 2>/dev/null && pwd)" || return 1
  root="$(git -C "$resolved" rev-parse --show-toplevel 2>/dev/null || true)"
  printf '%s' "${root:-$resolved}"
}

bf_runtime_dir() {
  local root
  root="$(bf_project_root "$1")" || return 1
  printf '%s/.do-it/runtime' "$root"
}

bf_config_path() {
  local runtime
  runtime="$(bf_runtime_dir "$1")" || return 1
  printf '%s/retrospective/config.json' "$runtime"
}

bf_command() {
  local prompt_lc
  prompt_lc="$(do_it_lc "$1")"
  if [[ "$prompt_lc" =~ ^[[:space:]]*/do-it-retrospective[[:space:]]+(on|off|status|report)[[:space:]]*$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

bf_set_enabled() {
  local cwd="$1" enabled="$2" runtime config tmp old_umask
  runtime="$(bf_runtime_dir "$cwd")" || return 1
  config="${runtime}/retrospective/config.json"
  mkdir -p "${runtime}/retrospective" 2>/dev/null || return 1
  _do_it_ensure_runtime_gitignore "$runtime"

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
}

bf_is_enabled() {
  local config
  config="$(bf_config_path "$1")" || return 1
  [[ -f "$config" ]] || return 1
  grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true' "$config" 2>/dev/null
}

bf_add_signal() {
  local current="$1" next="$2"
  case ",$current," in
    *,"$next",*) printf '%s' "$current" ;;
    ',,') printf '%s' "$next" ;;
    *) printf '%s,%s' "$current" "$next" ;;
  esac
}

bf_signals() {
  local prompt_lc signals=""
  prompt_lc="$(do_it_lc "$1")"

  case "$prompt_lc" in
    *"行为不对"*|*"行为不符合预期"*|*"行为不符合"*|*"do-it 不对"*|*"hook 不对"*)
      signals="$(bf_add_signal "$signals" behavior)"
      ;;
  esac

  if [[ "$prompt_lc" =~ (子智能体|子代理|sub[[:space:]-]?agent) ]] \
     && [[ "$prompt_lc" =~ (不怎么调用|没有调用|没调用|未调用|没有用|没用|not[[:space:]]using|didn.t[[:space:]]use|did[[:space:]]not[[:space:]]use) ]]; then
    signals="$(bf_add_signal "$signals" delegation)"
  fi

  if [[ "$prompt_lc" =~ (do-it|doit|this[[:space:]]+plugin|the[[:space:]]+plugin|plugin[[:space:]]+behavior|hook[[:space:]]+behavior|插件.*(行为|表现)|hook.*(行为|表现)) ]] \
     && [[ "$prompt_lc" =~ (不对|不符合|不应该|不该|混乱|错误|有问题|wrong|unexpected|shouldn.t|didn.t|did[[:space:]]not|not[[:space:]]what|confusing|missed) ]]; then
    signals="$(bf_add_signal "$signals" behavior)"
  fi

  [[ -n "$signals" ]] || return 1
  printf '%s' "$signals"
}

bf_redact_excerpt() {
  command -v sed >/dev/null 2>&1 || return 1
  local text
  text="$(printf '%s' "$1" | tr '\r\n\t' '   ' | LC_ALL=C sed -E \
    -e 's#```[^`]*```#[REDACTED_CODE]#g' \
    -e 's#https?://[^[:space:]"<>]+#[REDACTED_URL]#g' \
    -e 's#[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}#[REDACTED_EMAIL]#g' \
    -e 's#([A-Za-z]:\\Users\\|/(home|Users|mnt|tmp)/)[^[:space:]"<>]*#[REDACTED_PATH]#g' \
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

bf_session_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum 2>/dev/null | cut -c1-12
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 2>/dev/null | cut -c1-12
  else
    printf '%s' "$1" | _do_it_hash_key
  fi
}

bf_host() {
  if [[ -n "${CURSOR_PLUGIN_ROOT:-}" || -n "${CURSOR_VERSION:-}" ]]; then
    printf 'cursor'
  elif [[ -n "${OPENCODE_DATA:-}" ]]; then
    printf 'opencode'
  elif [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
    printf 'claude'
  elif [[ -n "${PLUGIN_ROOT:-}" || -n "${CODEX_HOME:-}" ]]; then
    printf 'codex'
  else
    printf 'unknown'
  fi
}

bf_append_event() {
  local cwd="$1" session_id="$2" signals="$3" excerpt="$4"
  local runtime events session_hash timestamp old_umask
  runtime="$(bf_runtime_dir "$cwd")" || return 1
  events="${runtime}/retrospective/events.jsonl"
  session_hash="$(bf_session_hash "$session_id")"
  [[ -n "$session_hash" ]] || return 1
  timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || true)"
  [[ -n "$timestamp" ]] || timestamp="unknown"

  old_umask="$(umask)"
  umask 077
  if ! printf '{"schema":1,"kind":"behavior-feedback","recorded_at":"%s","host":"%s","session":"%s","signals":"%s","prompt_excerpt":"%s"}\n' \
    "$(_do_it_json_escape "$timestamp")" \
    "$(_do_it_json_escape "$(bf_host)")" \
    "$(_do_it_json_escape "$session_hash")" \
    "$(_do_it_json_escape "$signals")" \
    "$(_do_it_json_escape "$excerpt")" >> "$events" 2>/dev/null; then
    umask "$old_umask"
    return 1
  fi
  umask "$old_umask"
  chmod 600 "$events" 2>/dev/null || true
}

RAW_INPUT="$(do_it_read_stdin)"
SESSION_ID="$(do_it_json_get "$RAW_INPUT" session_id)"
PROMPT="$(do_it_json_get "$RAW_INPUT" prompt)"
CWD="$(do_it_json_get "$RAW_INPUT" cwd)"
TRANSCRIPT_PATH="$(do_it_json_get "$RAW_INPUT" transcript_path)"
AGENT_ID="$(do_it_json_get "$RAW_INPUT" agent_id)"
AGENT_TYPE="$(do_it_json_get "$RAW_INPUT" agent_type)"
HOOK_EVENT_NAME="$(do_it_json_get "$RAW_INPUT" hook_event_name)"
COMMAND_NAME="$(do_it_json_get "$RAW_INPUT" command_name)"

[[ -n "$PROMPT" && -n "$CWD" ]] || exit 0
if [[ -n "$AGENT_ID" || -n "$AGENT_TYPE" ]] || do_it_in_subagent_context "$TRANSCRIPT_PATH"; then
  exit 0
fi
# Claude sends the unexpanded slash text only to UserPromptExpansion. Keep this
# hook inert for every other expansion event even if a host invokes it broadly.
if [[ "$HOOK_EVENT_NAME" == "UserPromptExpansion" && "$COMMAND_NAME" != "do-it-retrospective" ]]; then
  exit 0
fi

case "$(bf_command "$PROMPT")" in
  on)
    bf_set_enabled "$CWD" true || true
    exit 0
    ;;
  off)
    bf_set_enabled "$CWD" false || true
    exit 0
    ;;
  status|report)
    exit 0
    ;;
esac

bf_is_enabled "$CWD" || exit 0
SIGNALS="$(bf_signals "$PROMPT")" || exit 0
EXCERPT="$(bf_redact_excerpt "$PROMPT")" || exit 0
[[ -n "$EXCERPT" ]] || exit 0

DEDUP_HASH="$(bf_session_hash "${SIGNALS}:${PROMPT}")"
[[ -n "$DEDUP_HASH" ]] || exit 0
if [[ "$(do_it_session_state_get "$SESSION_ID" behavior_feedback_last_hash)" == "$DEDUP_HASH" ]]; then
  exit 0
fi

if bf_append_event "$CWD" "$SESSION_ID" "$SIGNALS" "$EXCERPT"; then
  do_it_session_state_set "$SESSION_ID" behavior_feedback_last_hash "$DEDUP_HASH"
fi

exit 0
