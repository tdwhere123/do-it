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

# Test if any keyword from the named array appears in the prompt (case-insensitive).
# Args: <prompt> <array-name>. Returns 0 on first match. Requires bash 4.3+.
do_it_prompt_has_any() {
  local prompt="$1" __do_it_array_name="$2"
  local lc
  lc="$(do_it_lc "$prompt")"
  local -n __do_it_arr_ref="$__do_it_array_name"
  local word lcw
  for word in "${__do_it_arr_ref[@]}"; do
    if [[ -z "$word" ]]; then continue; fi
    lcw="$(do_it_lc "$word")"
    case "$lc" in
      *"$lcw"*) return 0 ;;
    esac
  done
  return 1
}

# Convenience wrapper for the escape-word table.
do_it_prompt_has_escape() {
  do_it_prompt_has_any "$1" DO_IT_ESCAPE_WORDS
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
