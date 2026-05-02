#!/usr/bin/env bash
# do-it hook shared helpers. Source from each hook script as:
#   source "${SCRIPT_DIR}/lib/common.sh"
#   source "${SCRIPT_DIR}/lib/keywords.sh"
#
# Helpers degrade silently (return ""/exit 0) when jq is unavailable, so a
# misconfigured environment never blocks the user.

set -uo pipefail

if command -v jq >/dev/null 2>&1; then
  DO_IT_HAVE_JQ=1
else
  DO_IT_HAVE_JQ=0
fi

# Read all of stdin and echo it back. Hook stdin is small (a single JSON blob).
do_it_read_stdin() {
  cat
}

# Get a top-level string field from a JSON blob.
# Args: <json> <field>. Echoes "" if missing or jq is unavailable.
do_it_json_get() {
  local json="$1" field="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$json" | jq -r --arg f "$field" '. as $o | $o[$f] // ""' 2>/dev/null
  fi
}

# Get a nested field with dot syntax. Args: <json> <a.b.c>.
do_it_json_get_nested() {
  local json="$1" pathspec="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$json" | jq -r ".${pathspec} // \"\"" 2>/dev/null
  fi
}

# Compute a session-scoped data dir. Caller is responsible for mkdir.
# Prefers ${CLAUDE_PLUGIN_DATA}/sessions/<id>; falls back to /tmp.
do_it_session_dir() {
  local session_id="${1:-anon}"
  if [[ -z "$session_id" ]]; then session_id="anon"; fi
  local base
  if [[ -n "${CLAUDE_PLUGIN_DATA:-}" ]]; then
    base="${CLAUDE_PLUGIN_DATA%/}/sessions"
  else
    base="${TMPDIR:-/tmp}/do-it-sessions"
  fi
  printf '%s/%s' "$base" "$session_id"
}

# Path of a skip flag for given hook. Args: <session_id> <flag>.
do_it_skip_flag_path() {
  local session_id="$1" flag="$2"
  printf '%s/skip-%s' "$(do_it_session_dir "$session_id")" "$flag"
}

# Test if skip flag is set. 0 = present, 1 = absent.
do_it_check_skip() {
  local session_id="$1" flag="$2"
  local p
  p="$(do_it_skip_flag_path "$session_id" "$flag")"
  [[ -f "$p" ]]
}

# Write skip flag(s). Args: <session_id> [flag1 flag2 ...]. Default: all three.
do_it_write_skip() {
  local session_id="$1"; shift
  local dir
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 0
  if [[ $# -eq 0 ]]; then
    set -- router grill gate
  fi
  for flag in "$@"; do
    : > "$dir/skip-${flag}"
  done
}

# Lower-case a string portably.
do_it_lc() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# Internal: detect whether a term is pure ASCII (printable + space). CJK and
# other multi-byte content fall through to substring matching.
_do_it_term_is_ascii() {
  ! printf '%s' "$1" | LC_ALL=C grep -q '[^[:print:]]'
}

# Word-boundary match against the prompt for a single ASCII term.
# Args: <lowercased-prompt> <lowercased-term>. Returns 0 on match.
do_it_prompt_has_word() {
  local lc="$1" lcw="$2"
  printf '%s' "$lc" | grep -qiwF -- "$lcw"
}

# Test if any keyword from the named array appears in the prompt.
# - Pure-ASCII terms: word-boundary match (so `fix` does not match `prefix`).
# - CJK / mixed terms: case-insensitive substring (CJK has no word boundaries).
# Args: <prompt> <array-name>. Requires bash 4.3+ for `local -n`.
do_it_prompt_has_any() {
  local prompt="$1" __do_it_array_name="$2"
  local lc
  lc="$(do_it_lc "$prompt")"
  local -n __do_it_arr_ref="$__do_it_array_name"
  local word lcw
  for word in "${__do_it_arr_ref[@]}"; do
    if [[ -z "$word" ]]; then continue; fi
    lcw="$(do_it_lc "$word")"
    if _do_it_term_is_ascii "$lcw"; then
      if do_it_prompt_has_word "$lc" "$lcw"; then
        return 0
      fi
    else
      case "$lc" in
        *"$lcw"*) return 0 ;;
      esac
    fi
  done
  return 1
}

# Convenience wrapper for the escape-word table.
do_it_prompt_has_escape() {
  do_it_prompt_has_any "$1" DO_IT_ESCAPE_WORDS
}

# Detect whether the current turn is a question / discussion (router caps at
# Light, grill hook suppressed). Triggered by:
#   - any term in DO_IT_QUESTION_HINTS
#   - prompt ends with `?`, `？`, 吗, or 呢 (after trimming whitespace)
do_it_prompt_is_question() {
  local prompt="$1"
  if do_it_prompt_has_any "$prompt" DO_IT_QUESTION_HINTS; then
    return 0
  fi
  local trimmed="$prompt"
  trimmed="${trimmed%[[:space:]]}"
  trimmed="${trimmed%[[:space:]]}"
  case "$trimmed" in
    *'?'|*'？'|*'吗'|*'呢') return 0 ;;
  esac
  return 1
}

# Internal: run a block under a per-session advisory lock so that concurrent
# UserPromptSubmit hooks (router + grill-prompt) do not clobber each other's
# state.json writes. flock is required for the lock; if missing we fall back
# to a non-locked write (last-writer-wins) and accept the risk on legacy
# systems. Args: <lock-path> <command...>
_do_it_with_state_lock() {
  local lock="$1"; shift
  if command -v flock >/dev/null 2>&1; then
    ( flock 9; "$@" ) 9>"$lock"
  else
    "$@"
  fi
}

# Read a value from the session state JSON. jq required for nested gets;
# without jq, falls back to plain key=value file `state.kv`.
# Args: <session_id> <key>. Echoes "" if missing.
do_it_session_state_get() {
  local session_id="$1" key="$2"
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" && -f "$state" ]]; then
    jq -r --arg k "$key" '. as $o | $o[$k] // ""' "$state" 2>/dev/null
    return 0
  fi
  if [[ -f "$dir/state.kv" ]]; then
    grep -E "^${key}=" "$dir/state.kv" 2>/dev/null | tail -n1 | cut -d= -f2-
  fi
}

# Internal: jq-backed set without locking (caller already holds the lock).
_do_it_session_state_set_locked() {
  local state="$1" key="$2" value="$3"
  if [[ -f "$state" ]]; then
    jq -c --arg k "$key" --arg v "$value" '. + {($k): $v}' "$state" > "$state.tmp" 2>/dev/null \
      && mv "$state.tmp" "$state"
  else
    jq -nc --arg k "$key" --arg v "$value" '{($k): $v}' > "$state" 2>/dev/null
  fi
}

# Write a value to session state. Last-write wins. Args: <session_id> <key> <value>.
do_it_session_state_set() {
  local session_id="$1" key="$2" value="$3"
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 0
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_set_locked "$state" "$key" "$value"
    return 0
  fi
  printf '%s=%s\n' "$key" "$value" >> "$dir/state.kv"
}

# Internal: jq-backed inc without locking (caller already holds the lock).
_do_it_session_state_inc_locked() {
  local state="$1" bucket="$2" name="$3"
  if [[ -f "$state" ]]; then
    jq -c --arg b "$bucket" --arg n "$name" \
      '.[$b] = ((.[$b] // {}) | (.[$n] = ((.[$n] // 0) | tonumber + 1)))' \
      "$state" > "$state.tmp" 2>/dev/null && mv "$state.tmp" "$state"
  else
    jq -nc --arg b "$bucket" --arg n "$name" '{($b): {($n): 1}}' > "$state" 2>/dev/null
  fi
}

# Increment a numeric counter sub-key in session state. Args: <session_id>
# <bucket-key> <counter-name>. Counters are stored as a single JSON object keyed
# by bucket-key (e.g. hook_invocations.{router,grill,gate}). With jq the bucket
# is a real nested object; without jq it degrades to flat <bucket>.<counter>=N
# lines in state.kv.
do_it_session_state_inc() {
  local session_id="$1" bucket="$2" name="$3"
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 0
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_inc_locked "$state" "$bucket" "$name"
    return 0
  fi
  local key="${bucket}.${name}"
  local prev
  prev="$(grep -E "^${key}=" "$dir/state.kv" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  prev="${prev:-0}"
  printf '%s=%d\n' "$key" $((prev + 1)) >> "$dir/state.kv"
}

# Pretty-print the session state as JSON. Args: <session_id>. Echoes "{}" when
# the session has no state yet.
do_it_session_summary() {
  local session_id="$1"
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  state="$dir/state.json"
  if [[ -f "$state" && "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq '.' "$state" 2>/dev/null
    return 0
  fi
  if [[ -f "$state" ]]; then
    cat "$state"
    return 0
  fi
  if [[ -f "$dir/state.kv" ]]; then
    cat "$dir/state.kv"
    return 0
  fi
  printf '{}\n'
}

# Emit additionalContext system-reminder via JSON. Args: <event-name> <text>.
do_it_emit_context() {
  local event="$1" text="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg e "$event" --arg t "$text" \
      '{hookSpecificOutput: {hookEventName: $e, additionalContext: $t}}'
  fi
}

# Emit Stop-hook block decision. Args: <reason>.
do_it_emit_block() {
  local reason="$1"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg r "$reason" '{decision: "block", reason: $r}'
  fi
}

# Project root inferred from cwd field. Falls back to pwd.
do_it_project_root() {
  local cwd="${1:-}"
  if [[ -n "$cwd" ]]; then
    printf '%s' "$cwd"
  else
    pwd
  fi
}

# Source the project-level keyword override if present.
do_it_source_local_keywords() {
  local cwd="${1:-}"
  if [[ -z "$cwd" ]]; then return 0; fi
  local local_kw="${cwd%/}/.do-it/keywords.local.sh"
  if [[ -f "$local_kw" ]]; then
    # shellcheck source=/dev/null
    source "$local_kw" 2>/dev/null || true
  fi
}
