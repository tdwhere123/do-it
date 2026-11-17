#!/usr/bin/env bash
# do-it hook shared helpers. Source from each hook script as:
#   source "${SCRIPT_DIR}/lib/common.sh"
#
# Helpers use jq when available and fall back to Node.js/Python JSON decoding;
# context emission retains a pure-shell final fallback. A misconfigured
# environment never crashes an advisory hook.

set -uo pipefail

if [[ "${DO_IT_FORCE_NO_JQ:-0}" != "1" ]] && command -v jq >/dev/null 2>&1; then
  DO_IT_HAVE_JQ=1
else
  DO_IT_HAVE_JQ=0
fi

# When hooks are invoked via user-level ~/.cursor/hooks.json (Cursor does not
# currently register plugin-local hooks/hooks.json), CURSOR_PLUGIN_ROOT /
# CURSOR_PLUGIN_DATA may be unset. Derive them from the calling hook's
# SCRIPT_DIR when that directory sits inside a local do-it-cursor plugin.
_do_it_maybe_set_cursor_plugin_env() {
  if [[ -z "${CURSOR_PLUGIN_ROOT:-}" && -n "${SCRIPT_DIR:-}" ]]; then
    local _parent
    _parent="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd)" || return 0
    if [[ -f "${_parent}/.cursor-plugin/plugin.json" ]]; then
      export CURSOR_PLUGIN_ROOT="$_parent"
    fi
  fi
  if [[ -z "${CURSOR_PLUGIN_DATA:-}" && -n "${CURSOR_PLUGIN_ROOT:-}" ]]; then
    export CURSOR_PLUGIN_DATA="${CURSOR_PLUGIN_ROOT}/.do-it-data"
  fi
}
_do_it_maybe_set_cursor_plugin_env

# True on Git Bash / MSYS / Cygwin where grep -q + pipefail often aborts.
_do_it_is_msys() {
  if [[ -n "${MSYSTEM:-}" ]]; then
    return 0
  fi
  case "$(uname -s 2>/dev/null || true)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
  esac
  return 1
}

# Read all of stdin and echo it back. Hook stdin is small (a single JSON blob).
do_it_read_stdin() {
  cat
}

# Portable JSON fallback for hosts without jq. do-it requires Node.js for its
# installer and plugins; Python 3 is a secondary path for direct hook installs.
# Args: <json> <dot-path> <scalar|prompt>.
_do_it_json_fallback() {
  local json="$1" pathspec="$2" mode="$3"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$json" | node -e '
      let source = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { source += chunk; });
      process.stdin.on("end", () => {
        try {
          let value = JSON.parse(source);
          for (const key of process.argv[1].split(".")) value = value?.[key];
          if (process.argv[2] === "prompt" && Array.isArray(value)) {
            value = value.filter((part) => part && typeof part.text === "string")
              .map((part) => part.text).join("\n");
          }
          if (value == null) value = "";
          if (typeof value === "object") value = "";
          process.stdout.write(String(value));
        } catch {}
      });
    ' "$pathspec" "$mode" 2>/dev/null
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -c '
import json, sys
try:
    value = json.load(sys.stdin)
    for key in sys.argv[1].split("."):
        value = value.get(key) if isinstance(value, dict) else None
    if sys.argv[2] == "prompt" and isinstance(value, list):
        value = "\n".join(part.get("text", "") for part in value if isinstance(part, dict))
    if value is None or isinstance(value, (dict, list)):
        value = ""
    if isinstance(value, bool):
        value = str(value).lower()
    sys.stdout.write(str(value))
except Exception:
    pass
    ' "$pathspec" "$mode" 2>/dev/null
  fi
}

# Get a top-level scalar field from a JSON blob. Args: <json> <field>.
do_it_json_get() {
  local json="$1" field="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$json" | jq -r --arg f "$field" '. as $o | $o[$f] // ""' 2>/dev/null
  else
    _do_it_json_fallback "$json" "$field" scalar
  fi
}

# Get submitted prompt text from a string or structured text content.
do_it_json_get_prompt() {
  local json="$1"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$json" | jq -r \
      '.prompt // "" | if type == "array" then [ .[]?.text // empty ] | join("\n") else . end' \
      2>/dev/null
  else
    _do_it_json_fallback "$json" prompt prompt
  fi
}

# Get a nested field with dot syntax. Args: <json> <a.b.c>.
do_it_json_get_nested() {
  local json="$1" pathspec="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    printf '%s' "$json" | jq -r ".${pathspec} // \"\"" 2>/dev/null
  else
    _do_it_json_fallback "$json" "$pathspec" scalar
  fi
}

_do_it_hash_key() {
  if command -v sha1sum >/dev/null 2>&1; then
    sha1sum 2>/dev/null | cut -c1-12
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 1 2>/dev/null | cut -c1-12
  else
    cksum 2>/dev/null | awk '{print $1}'
  fi
}

# Internal: drop a self-contained `.gitignore` inside the runtime dir itself
# instead of editing the repo's top-level `.gitignore`. This keeps worktrees
# clean (no spurious modification of `.gitignore`) and makes the ignore rule
# survive even when the parent repo has no `.gitignore`. The runtime dir is
# `<repo>/.do-it/runtime/`; the marker ignores its contents, and a narrow local
# Git exclude hides that untracked nested directory without editing project
# rules.
#
# Args: <runtime_dir> (e.g. `<repo_root>/.do-it/runtime`).
# Idempotent and best-effort; failures stay silent.
_do_it_ensure_runtime_gitignore() {
  local runtime_dir="$1"
  [[ -z "$runtime_dir" || ! -d "$runtime_dir" ]] && return 0
  local marker="${runtime_dir}/.gitignore"
  # Migrate the former two-line marker, which left `.do-it/` visible as an
  # untracked directory in projects without a parent ignore rule.
  if [[ -f "$marker" ]]; then
    if [[ "$(<"$marker")" == $'*\n!.gitignore' ]]; then
      printf '%s\n' '*' > "$marker" 2>/dev/null || true
    fi
  else
    printf '%s\n' '*' > "$marker" 2>/dev/null || return 0
  fi
  _do_it_ensure_runtime_git_exclude "$runtime_dir"
}

# Keep `.do-it/runtime` local even when a repository does not track a parent
# `.gitignore`. This only touches Git's per-worktree metadata and never changes
# project files. Non-git directories simply retain the self-contained marker.
_do_it_ensure_runtime_git_exclude() {
  local runtime_dir="$1" root exclude
  root="$(git -C "$runtime_dir" rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$root" && "$runtime_dir" == "$root/.do-it/runtime" ]] || return 0
  exclude="$(git -C "$runtime_dir" rev-parse --git-path info/exclude 2>/dev/null || true)"
  [[ -n "$exclude" ]] || return 0
  [[ "$exclude" == /* ]] || exclude="$root/$exclude"
  [[ -L "$exclude" ]] && return 0
  mkdir -p "$(dirname "$exclude")" 2>/dev/null || return 0
  if [[ ! -e "$exclude" ]]; then
    printf '%s\n' '/.do-it/runtime/' > "$exclude" 2>/dev/null || return 0
  elif ! grep -Fqx '/.do-it/runtime/' "$exclude" 2>/dev/null; then
    printf '\n%s\n' '/.do-it/runtime/' >> "$exclude" 2>/dev/null || return 0
  fi
}

# Compute a session-scoped data dir. Caller is responsible for mkdir.
# Canonical resolution order — mirrored by install/manage.mjs (sessionsBaseDir)
# and docs/harness-adapter-matrix.md; keep all three in sync:
#   1. $CURSOR_PLUGIN_DATA/sessions
#   2. $CLAUDE_PLUGIN_DATA/sessions
#   3. $PLUGIN_DATA/sessions          (native plugin data)
#   4. $DO_IT_HOOK_DATA/sessions      (adapter override)
#   5. $CODEX_HOME/do-it-data/sessions
#   6. ${TMPDIR:-/tmp}/do-it-sessions
# A writable check guards (1)–(5) so an unwritable mount silently falls
# through. The repo-root path also ensures `.do-it/runtime/` is gitignored.
do_it_session_dir() {
  local session_id_in="${1:-}"
  local key
  if [[ -n "$session_id_in" ]]; then
    # Path-injection guard: reject any session id containing a path separator,
    # a parent-dir token, a bare current-dir token, NUL, or any control
    # character (including LF/CR/TAB, which `grep` would treat as line
    # separators and miss). Such ids would let a caller escape the per-session
    # sandbox (e.g. `do_it_session_dir "../foo"` would write under
    # `<base>/../foo/state.json`, and a literal `.` would resolve to the bare
    # base dir). Hooks must never block the user, so degrade gracefully by
    # hashing the offending id and using the hash as the key — same shape as
    # the empty-id fallback below.
    local _hazard=0
    case "$session_id_in" in
      .|..) _hazard=1 ;;
      */*|*..*) _hazard=1 ;;
      *$'\n'*|*$'\r'*|*$'\t'*) _hazard=1 ;;
    esac
    # Catch any remaining non-printable bytes (NUL, control chars beyond
    # LF/CR/TAB). `tr -d '[:print:]'` strips printable+space; a non-zero
    # remainder means the id contains something the case branches missed.
    if [[ "$_hazard" -eq 0 ]]; then
      local _np
      _np="$(printf '%s' "$session_id_in" | LC_ALL=C tr -d '[:print:][:space:]' | wc -c | tr -d ' ')"
      if [[ "${_np:-0}" -ne 0 ]]; then
        _hazard=1
      fi
    fi
    if [[ "$_hazard" -eq 1 ]]; then
      key="$(printf '%s' "$session_id_in" | _do_it_hash_key)"
      if [[ -z "$key" ]]; then key="nosession"; fi
    else
      key="$session_id_in"
    fi
  else
    local repo_root
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"
    if [[ -n "$repo_root" ]]; then
      key="$(printf '%s' "$repo_root" | _do_it_hash_key)"
      if [[ -z "$key" ]]; then key="nosession"; fi
    else
      # Non-git, no session id: hash the cwd so each project gets its own
      # bucket instead of all of them sharing a global `nosession` dir.
      key="$(printf '%s' "$(pwd 2>/dev/null)" | _do_it_hash_key)"
      if [[ -z "$key" ]]; then key="nosession"; fi
    fi
  fi

  local base=""
  local candidate

  # Each branch: set base only if the parent dir is writable.
  if [[ -n "${CURSOR_PLUGIN_DATA:-}" ]]; then
    candidate="${CURSOR_PLUGIN_DATA%/}/sessions"
    if ( [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null || [[ -d "$candidate" ]] ) && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${CLAUDE_PLUGIN_DATA:-}" ]]; then
    candidate="${CLAUDE_PLUGIN_DATA%/}/sessions"
    if ( [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null || [[ -d "$candidate" ]] ) && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${PLUGIN_DATA:-}" ]]; then
    candidate="${PLUGIN_DATA%/}/sessions"
    if ( [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null || [[ -d "$candidate" ]] ) && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${DO_IT_HOOK_DATA:-}" ]]; then
    candidate="${DO_IT_HOOK_DATA%/}/sessions"
    if ( [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null || [[ -d "$candidate" ]] ) && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${CODEX_HOME:-}" ]]; then
    candidate="${CODEX_HOME%/}/do-it-data/sessions"
    if ( [[ -d "$candidate" ]] || mkdir -p "$candidate" 2>/dev/null || [[ -d "$candidate" ]] ) && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" ]]; then
    base="${TMPDIR:-/tmp}/do-it-sessions"
  fi

  printf '%s/%s' "$base" "$key"
}

# Compact context delivery. Native host policy owns permissions.
do_it_kernel_body() {
  local context_file="${BASH_SOURCE[0]%/*}/../data/core-context.txt" body
  [[ -f "$context_file" && -r "$context_file" ]] || return 1
  body="$(cat -- "$context_file" 2>/dev/null)" || return 1
  [[ -n "$body" ]] || return 1
  printf '%s' "$body"
}

# Deliver once per session. User intent remains in the conversation; this helper
# never infers or stores authorization from prompt phrases.
do_it_kernel_context_collect() {
  local session_id="${1:-}" transcript="${4:-}" raw_input="${5:-}" kernel_body last_kernel
  if do_it_in_subagent_context "$transcript" "$raw_input"; then return 0; fi
  kernel_body="$(do_it_kernel_body)" || return 0
  last_kernel="$(do_it_session_state_get "$session_id" kernel_text)"
  if [[ "$last_kernel" != "$kernel_body" ]]; then
    printf '%s' "$kernel_body"
    do_it_session_state_set "$session_id" kernel_text "$kernel_body" 2>/dev/null || true
  fi
  return 0
}

# shellcheck source=session-state.sh
source "${BASH_SOURCE[0]%/*}/session-state.sh"

# Detect subagent execution across Pi, Claude Code, Codex, Cursor, Grok, and AGY.
do_it_in_subagent_context() {
  # Pi's adapter carries creator/subprocess authority per hook invocation.
  # Other hosts and Pi callers without a role keep their existing fallback.
  if [[ "${DO_IT_EVENT_HOST:-}" == "pi" ]]; then
    case "${DO_IT_PI_SESSION_ROLE:-}" in
      child) return 0 ;;
      root) return 1 ;;
    esac
  fi
  local tp_arg="${1:-}"
  local raw_input="${2:-}"
  local tp_normalized="${tp_arg//\\//}"
  local env_tp_normalized="${transcript_path:-}"
  env_tp_normalized="${env_tp_normalized//\\//}"
  if [[ "${PI_SUBAGENT_CHILD:-}" == "1" ]]; then
    return 0
  fi
  if [[ -n "${CLAUDE_AGENT_CONTEXT:-}" || -n "${CLAUDE_SUBAGENT:-}" ]]; then
    return 0
  fi
  if [[ -n "${CURSOR_SUBAGENT:-}" || -n "${CURSOR_AGENT_CONTEXT:-}" ]]; then
    return 0
  fi
  if [[ -n "$tp_normalized" && ( "$tp_normalized" == *"/agents/"* || "$tp_normalized" == *"/subagents/"* ) ]]; then
    return 0
  fi
  # Best-effort env fallback when the surrounding shell exports transcript_path.
  if [[ -n "$env_tp_normalized" && ( "$env_tp_normalized" == *"/agents/"* || "$env_tp_normalized" == *"/subagents/"* ) ]]; then
    return 0
  fi
  if [[ -n "$raw_input" ]]; then
    local ev="" subagent_type="" agent_id=""
    if [[ "$raw_input" == *"SubagentStart"* || "$raw_input" == *"subagentStart"* || "$raw_input" == *"subagent_start"* ]]; then
      ev="$(do_it_json_get "$raw_input" hook_event_name)"
      [[ -n "$ev" ]] || ev="$(do_it_json_get "$raw_input" hookEventName)"
      case "$ev" in
        SubagentStart|subagentStart|subagent_start) return 0 ;;
      esac
    fi
    if [[ "$raw_input" == *"subagentType"* ]]; then
      subagent_type="$(do_it_json_get "$raw_input" subagentType)"
      [[ -n "$subagent_type" ]] && return 0
    fi
    if [[ "$raw_input" == *"agent_id"* ]]; then
      agent_id="$(do_it_json_get "$raw_input" agent_id)"
      [[ -n "$agent_id" ]] && return 0
    fi
  fi
  if [[ -n "$tp_arg" && -f "$tp_arg" && -r "$tp_arg" ]]; then
    local first_line=""
    IFS= read -r first_line < "$tp_arg" 2>/dev/null || first_line=""
    if [[ "$first_line" == *'"step_index":0'* || "$first_line" == *'"step_index": 0'* ]]; then
      if [[ "$first_line" == *'"source":"SYSTEM"'* || "$first_line" == *'"source": "SYSTEM"'* ]] \
        && [[ "$first_line" == *'"type":"SYSTEM_MESSAGE"'* || "$first_line" == *'"type": "SYSTEM_MESSAGE"'* ]]; then
        return 0
      fi
      if [[ "$first_line" == *'"source":"USER_EXPLICIT"'* || "$first_line" == *'"source": "USER_EXPLICIT"'* ]]; then
        return 1
      fi
    fi
    if [[ "$tp_normalized" == */rollout-*.jsonl ]]; then
      if printf '%s' "$first_line" | grep -qE '"source"[[:space:]]*:[[:space:]]*\{"subagent"'; then
        return 0
      fi
    fi
    if [[ "$tp_normalized" == */chat_history.jsonl ]]; then
      local summary_file="${tp_arg%/*}/summary.json"
      if [[ -f "$summary_file" ]] && grep -qE '"session_kind"[[:space:]]*:[[:space:]]*"subagent' "$summary_file" 2>/dev/null; then
        return 0
      fi
    fi
  fi
  return 1
}

# Isolate concurrent subagent state buckets when the host shares the parent session_id.
do_it_effective_session_id() {
  local session_id="${1:-}" tp_arg="${2:-}" raw_input="${3:-}"
  if [[ "${DO_IT_EVENT_HOST:-}" == "pi" ]]; then
    printf '%s' "$session_id"
    return 0
  fi
  if [[ -n "$raw_input" && "$raw_input" == *"agent_id"* ]]; then
    local agent_id
    agent_id="$(do_it_json_get "$raw_input" agent_id)"
    if [[ -n "$agent_id" ]]; then
      printf 'subagent-%s' "$agent_id"
      return 0
    fi
  fi
  if [[ -n "$tp_arg" ]] && do_it_in_subagent_context "$tp_arg" "$raw_input"; then
    local tp_normalized="${tp_arg//\\//}"
    local base="${tp_normalized##*/}"
    if [[ "$tp_normalized" == */rollout-*.jsonl || "$tp_normalized" == */subagents/*.jsonl || "$tp_normalized" == */agents/*.jsonl ]]; then
      printf 'subagent-%s' "${base%.jsonl}"
      return 0
    fi
  fi
  printf '%s' "$session_id"
}

# Internal: escape a string for embedding inside a JSON string literal.
# Backslash must be replaced first. Args: <string>.
_do_it_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

# Emit additionalContext system-reminder via JSON. Args: <event-name> <text>.
# Adapters can explicitly request plain text; Cursor uses top-level additional_context.
do_it_emit_context() {
  local event="$1" text="$2"
  if [[ "${DO_IT_CONTEXT_OUTPUT:-}" == "plain" ]]; then
    printf '%s\n' "$text"
    return 0
  fi
  local is_cursor=0
  case "${DO_IT_EVENT_HOST:-}" in
    cursor) is_cursor=1 ;;
    "")
      if [[ -n "${CURSOR_PLUGIN_ROOT:-}" ]]; then
        is_cursor=1
      elif [[ -n "${CURSOR_VERSION:-}" && -z "${CLAUDE_PLUGIN_ROOT:-}" && -z "${CODEX_HOME:-}" && -z "${GROK_PLUGIN_ROOT:-}" && -z "${ANTIGRAVITY_AGENT:-}" ]]; then
        is_cursor=1
      fi
      ;;
  esac
  if [[ "$is_cursor" -eq 1 ]]; then
    if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
      jq -nc --arg t "$text" '{additional_context: $t}'
    else
      printf '{"additional_context":"%s"}\n' "$(_do_it_json_escape "$text")"
    fi
    return 0
  fi
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg e "$event" --arg t "$text" \
      '{hookSpecificOutput: {hookEventName: $e, additionalContext: $t}}'
  else
    printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
      "$(_do_it_json_escape "$event")" "$(_do_it_json_escape "$text")"
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
