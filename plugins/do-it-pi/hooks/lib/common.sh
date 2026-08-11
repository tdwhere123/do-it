#!/usr/bin/env bash
# do-it hook shared helpers. Source from each hook script as:
#   source "${SCRIPT_DIR}/lib/common.sh"
#   source "${SCRIPT_DIR}/lib/keywords.sh"
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

# Get the submitted prompt text. Hosts disagree on shape: Claude/Codex/Cursor/
# OpenCode send a plain string; Kimi Code sends a ContentPart array.
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
# Canonical resolution order — mirrored by install/manage.mjs
# (sessionsBaseDir), plugins/do-it-opencode/src/bridge.ts
# (resolveSessionStateDir), and docs/harness-adapter-matrix.md; keep all
# four in sync:
#   1. $CURSOR_PLUGIN_DATA/sessions   (Cursor plugin data)
#   2. $CLAUDE_PLUGIN_DATA/sessions   (host-provided plugin data)
#   3. $PLUGIN_DATA/sessions          (Codex plugin data; also set via DO_IT_HOOK_DATA in hooks.json)
#   4. $DO_IT_HOOK_DATA/sessions      (explicit override / wrapped PLUGIN_DATA)
#   5. $OPENCODE_DATA/sessions        (OpenCode plugin data)
#   6. $KIMI_CODE_HOME/do-it-data/sessions  (Kimi Code; never KIMI_PLUGIN_ROOT — managed, read-only)
#   7. $CODEX_HOME/do-it-data/sessions
#   8. <git repo root>/.do-it/runtime/sessions
#   9. ${TMPDIR:-/tmp}/do-it-sessions
# A writable check guards (1)–(7) so an unwritable mount silently falls
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
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${CLAUDE_PLUGIN_DATA:-}" ]]; then
    candidate="${CLAUDE_PLUGIN_DATA%/}/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${PLUGIN_DATA:-}" ]]; then
    candidate="${PLUGIN_DATA%/}/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${DO_IT_HOOK_DATA:-}" ]]; then
    candidate="${DO_IT_HOOK_DATA%/}/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${OPENCODE_DATA:-}" ]]; then
    candidate="${OPENCODE_DATA%/}/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${KIMI_CODE_HOME:-}" ]]; then
    candidate="${KIMI_CODE_HOME%/}/do-it-data/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" && -n "${CODEX_HOME:-}" ]]; then
    candidate="${CODEX_HOME%/}/do-it-data/sessions"
    if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
      base="$candidate"
    fi
  fi
  if [[ -z "$base" ]]; then
    local repo_root
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"
    if [[ -n "$repo_root" && -d "$repo_root" ]]; then
      candidate="${repo_root}/.do-it/runtime/sessions"
      if mkdir -p "$candidate" 2>/dev/null && [[ -w "$candidate" ]]; then
        base="$candidate"
        # Drop a self-contained .gitignore inside the runtime dir (never
        # touches the repo's top-level .gitignore, so worktrees stay clean).
        _do_it_ensure_runtime_gitignore "${repo_root}/.do-it/runtime"
      fi
    fi
  fi
  if [[ -z "$base" ]]; then
    base="${TMPDIR:-/tmp}/do-it-sessions"
  fi

  printf '%s/%s' "$base" "$key"
}

# Path of a skip flag for given hook. Args: <session_id> <flag>.
do_it_skip_flag_path() {
  local session_id="$1" flag="$2"
  printf '%s/skip-%s' "$(do_it_session_dir "$session_id")" "$flag"
}

# Skip-flag TTL in seconds (backup safety net). Primary lifecycle: verification-
# gate Stop hook clears all skip flags after each turn; TTL only covers leaks when
# Stop did not run (legacy empty files use file mtime; timestamped files use body).
DO_IT_SKIP_TTL_SECONDS="${DO_IT_SKIP_TTL_SECONDS:-300}"

# Model-adaptive advisory mode: `pointer` (one do-it-core pointer) vs `inline`
# (full core-rule sentences). Explicit env value wins; `auto` inspects the hook
# payload `model` field, then host model env vars. Strong-model patterns get the
# pointer; weak, unknown, or undetected models default to inline (content used
# over token economy — conservative for the models that need the rules).
DO_IT_ADVISORY_MODE="${DO_IT_ADVISORY_MODE:-auto}"

# Closed-set core-rule registry (single voice for rule emission). The path may
# be overridden for packaged installs and deterministic failure-path tests.
_DO_IT_RULES_DATA="${DO_IT_RULES_DATA:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../data" && pwd)/execution-failure-modes.tsv}"

# Registry helper status codes: 0=success, 1=missing/unreadable, 2=malformed,
# 3=requested rule or surface absent. Helpers emit no text on failure so a
# malformed registry can never produce partial canonical context.
DO_IT_CORE_RULES_UNAVAILABLE=1
DO_IT_CORE_RULES_MALFORMED=2
DO_IT_CORE_RULES_UNKNOWN=3

# Internal: validate the complete registry before printing any rule text.
# Args: <rule|surface> <value>.
_do_it_core_rules_read() {
  local mode="$1" requested="$2" status
  [[ -f "$_DO_IT_RULES_DATA" && -r "$_DO_IT_RULES_DATA" ]] || return "$DO_IT_CORE_RULES_UNAVAILABLE"
  [[ "$mode" == "rule" || "$mode" == "surface" ]] || return "$DO_IT_CORE_RULES_UNKNOWN"
  awk -v mode="$mode" -v requested="$requested" '
    function has_surface(value, wanted,    parts, count, i) {
      count = split(value, parts, ",")
      for (i = 1; i <= count; i++) if (parts[i] == wanted) return 1
      return 0
    }
    BEGIN {
      expected["r-route"] = 1
      expected["r-evidence"] = 1
      expected["r-scope"] = 1
      expected["r-verify"] = 1
      expected["r-uncertainty"] = 1
      expected["r-boundary"] = 1
      expected["r-report"] = 1
      expected["r-recovery"] = 1
    }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ /^[[:space:]]*$/ || line ~ /^#/) next
      count = split(line, fields, "\t")
      if (count != 4 || fields[1] == "" || fields[2] == "" ||
          fields[3] == "" || fields[4] == "" ||
          !(fields[1] in expected) || seen[fields[1]]++) {
        malformed = 1
        next
      }
      surface_count = split(fields[4], surfaces, ",")
      for (i = 1; i <= surface_count; i++) {
        if (surfaces[i] != "UserPromptSubmit" && surfaces[i] != "Stop" && surfaces[i] != "none") {
          malformed = 1
        }
      }
      rows++
      ids[rows] = fields[1]
      texts[rows] = fields[2]
      row_surfaces[rows] = fields[4]
    }
    END {
      if (rows != 8) malformed = 1
      for (id in expected) if (!seen[id]) malformed = 1
      if (malformed) exit 20
      for (i = 1; i <= rows; i++) {
        if ((mode == "rule" && ids[i] == requested) ||
            (mode == "surface" && has_surface(row_surfaces[i], requested))) {
          print texts[i]
          found = 1
        }
      }
      if (!found) exit 21
    }
  ' "$_DO_IT_RULES_DATA" 2>/dev/null
  status=$?
  case "$status" in
    0) return 0 ;;
    20) return "$DO_IT_CORE_RULES_MALFORMED" ;;
    21) return "$DO_IT_CORE_RULES_UNKNOWN" ;;
    *) return "$DO_IT_CORE_RULES_UNAVAILABLE" ;;
  esac
}

# Print the rule_text of a rule_id row from execution-failure-modes.tsv.
# Args: <rule_id>. See status codes above.
do_it_core_rule() {
  _do_it_core_rules_read rule "$1"
}

# Print every rule_text whose injection_surface contains <surface>, one per
# line in file order. Args: <surface>. See status codes above.
do_it_core_rules_for() {
  _do_it_core_rules_read surface "$1"
}

# Resolve the effective advisory mode. Args: <raw-json-payload>.
# Echoes `pointer` or `inline`. Never echoes `auto`.
do_it_advisory_mode() {
  local raw_input="${1:-}" mode="${DO_IT_ADVISORY_MODE:-auto}"
  case "$mode" in
    pointer|inline) printf '%s' "$mode"; return 0 ;;
  esac
  local model v
  model="$(do_it_json_get "$raw_input" model)"
  if [[ -z "$model" ]]; then
    for v in OPENCODE_MODEL ANTHROPIC_MODEL OPENAI_MODEL CODEX_MODEL KIMI_MODEL PI_MODEL; do
      if [[ -n "${!v:-}" ]]; then
        model="${!v}"
        break
      fi
    done
  fi
  model="$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]')"
  case "$model" in
    *deepseek*|*qwen*|*glm*|*kimi*|*moonshot*|*llama*|*yi*|*minimax*|*abab*|*ernie*|*doubao*)
      printf '%s' "inline"; return 0 ;;
    *claude*|*gpt*|*gemini*)
      printf '%s' "pointer"; return 0 ;;
  esac
  if printf '%s' "$model" | LC_ALL=C grep -E '(^|[^[:alnum:]_])o(1|3|4)([^[:alnum:]_]|$)' >/dev/null 2>&1; then
    printf '%s' "pointer"
  else
    printf '%s' "inline"
  fi
}

# Age (in days) past which an inactive session directory is pruned by
# do_it_prune_stale_sessions. Session dirs accumulate one bucket per repo /
# session id and are never otherwise cleaned up.
DO_IT_SESSION_TTL_DAYS="${DO_IT_SESSION_TTL_DAYS:-7}"

# Validate one skip marker for an optional prompt hash. Empty legacy markers use
# mtime; timestamped markers use their first field. This helper never removes a
# file, so check and consume can be composed safely under the skip lock.
_do_it_skip_file_valid() {
  local p="$1" expected_hash="$2" ts="" stored_hash="" now age mtime
  [[ -f "$p" ]] || return 1
  now=$(date +%s 2>/dev/null)
  if [[ ! -s "$p" ]]; then
    mtime=$(stat -c %Y "$p" 2>/dev/null || stat -f %m "$p" 2>/dev/null || printf '')
    [[ -n "$mtime" && -n "$now" ]] || return 1
    age=$((now - mtime))
    (( age < 0 || age <= DO_IT_SKIP_TTL_SECONDS ))
    return $?
  fi
  IFS=$'\t' read -r ts stored_hash < "$p" || true
  case "$ts" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [[ -n "$stored_hash" && -n "$expected_hash" && "$stored_hash" != "$expected_hash" ]]; then
    return 1
  fi
  [[ -z "$now" ]] && return 0
  age=$((now - ts))
  (( age < 0 || age <= DO_IT_SKIP_TTL_SECONDS ))
}

# Test whether the active prompt has a live skip marker. Prompt-scoped markers
# use one file per serialized prompt transaction, so identical concurrent
# prompts do not overwrite each other. Legacy unkeyed markers remain readable.
do_it_check_skip() {
  local session_id="$1" flag="$2" dir prompt_hash="" p
  dir="$(do_it_session_dir "$session_id")"
  if [[ -n "${DO_IT_SKIP_PROMPT:-}" ]]; then
    prompt_hash="$(_do_it_skip_prompt_hash "$DO_IT_SKIP_PROMPT")"
    for p in "$dir/skip-${flag}-${prompt_hash}-"*; do
      [[ -f "$p" ]] || continue
      _do_it_skip_file_valid "$p" "$prompt_hash" && return 0
    done
  fi
  p="$(do_it_skip_flag_path "$session_id" "$flag")"
  if _do_it_skip_file_valid "$p" "$prompt_hash"; then
    return 0
  fi
  [[ ! -f "$p" ]] || rm -f "$p" 2>/dev/null || return 1
  return 1
}

# Internal atomic writer. Caller holds .skip.lock. Args:
# <dir> <prompt-hash> <turn-hash> <flag...>.
_do_it_write_skip_locked() {
  local dir="$1" prompt_hash="$2" turn_hash="$3"; shift 3
  local now flag p tmp
  now=$(date +%s 2>/dev/null)
  for flag in "$@"; do
    if [[ -n "$prompt_hash" ]]; then
      p="$dir/skip-${flag}-${prompt_hash}-${turn_hash}"
    else
      p="$dir/skip-${flag}"
    fi
    tmp="${p}.${BASHPID:-$$}.$RANDOM.tmp"
    if [[ -n "$now" && -n "$prompt_hash" ]]; then
      printf '%s\t%s\n' "$now" "$prompt_hash" > "$tmp" 2>/dev/null || return 1
    elif [[ -n "$now" ]]; then
      printf '%s\n' "$now" > "$tmp" 2>/dev/null || return 1
    else
      : > "$tmp" 2>/dev/null || return 1
    fi
    if ! mv -f "$tmp" "$p" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      return 1
    fi
  done
}

# Hash the prompt for skip-marker scoping. The transcript copy of a prompt
# seen by the Stop hook may carry host normalization (trailing newline or
# whitespace), so the write and read sides trim trailing whitespace before
# hashing — otherwise "skip gate" markers silently miss at the gate.
_do_it_skip_prompt_hash() {
  local prompt="${1:-}"
  prompt="$(printf '%s' "$prompt" | sed -e 's/[[:space:]]*$//')"
  printf '%s' "$prompt" | _do_it_hash_key
}

# Write skip flag(s). Args: <session_id> [flag1 flag2 ...]. Default: all three.
# Returns nonzero if the prompt-scoped marker cannot be committed.
do_it_write_skip() {
  local session_id="$1"; shift
  local dir prompt_hash="" turn_hash=""
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  if [[ $# -eq 0 ]]; then
    set -- router grill gate
  fi
  if [[ -n "${DO_IT_SKIP_PROMPT:-}" ]]; then
    prompt_hash="$(_do_it_skip_prompt_hash "$DO_IT_SKIP_PROMPT")"
    turn_hash="$(printf '%s' "${DO_IT_PROMPT_TURN_TOKEN:-$prompt_hash}" | _do_it_hash_key)"
  fi
  _do_it_with_state_lock "$dir/.skip.lock" \
    _do_it_write_skip_locked "$dir" "$prompt_hash" "$turn_hash" "$@"
}

# Internal consumer. Caller holds .skip.lock. Removes at most one marker for
# each flag, preserving another identical prompt transaction's marker.
_do_it_clear_skip_locked() {
  local session_id="$1" prompt_hash="$2" dir flag p removed status=0
  dir="$(do_it_session_dir "$session_id")"
  for flag in router grill gate; do
    removed=0
    if [[ -n "$prompt_hash" ]]; then
      for p in "$dir/skip-${flag}-${prompt_hash}-"*; do
        [[ -f "$p" ]] || continue
        if _do_it_skip_file_valid "$p" "$prompt_hash"; then
          rm -f "$p" 2>/dev/null || status=1
          removed=1
          break
        fi
      done
    fi
    [[ "$removed" -eq 1 ]] && continue
    p="$(do_it_skip_flag_path "$session_id" "$flag")"
    if _do_it_skip_file_valid "$p" "$prompt_hash"; then
      rm -f "$p" 2>/dev/null || status=1
    fi
  done
  return "$status"
}

# Consume skip markers belonging to the active prompt under one lock. With no
# recoverable prompt, only legacy unkeyed markers are touched; keyed markers are
# left for their own Stop event or session TTL pruning.
do_it_clear_skip() {
  local session_id="$1" dir prompt_hash=""
  dir="$(do_it_session_dir "$session_id")"
  [[ -d "$dir" ]] || return 0
  if [[ -n "${DO_IT_SKIP_PROMPT:-}" ]]; then
    prompt_hash="$(_do_it_skip_prompt_hash "$DO_IT_SKIP_PROMPT")"
  fi
  _do_it_with_state_lock "$dir/.skip.lock" \
    _do_it_clear_skip_locked "$session_id" "$prompt_hash"
}

# Parse skip targets from a prompt. Prints a space-separated deduped list on stdout
# (router, grill, gate). Partial targets win over full-skip escape words.
do_it_parse_skip_targets() {
  local prompt="$1"
  local lc targets=() t seen=""
  lc="$(do_it_lc "$prompt")"

  _do_it_skip_add() {
    local flag="$1"
    case " $seen " in
      *" $flag "*) return 0 ;;
    esac
    targets+=("$flag")
    seen="${seen} ${flag}"
  }

  _do_it_skip_phrase_intended() {
    local phrase="$1"
    [[ "$lc" == *"$phrase"* ]] || return 1
    case "$lc" in
      *"don't $phrase"*|*"do not $phrase"*|*"not $phrase"*|\
      *"无需 $phrase"*|*"无需$phrase"*|*"不要 $phrase"*|*"不要$phrase"*|\
      *"别 $phrase"*|*"别$phrase"*)
        return 1
        ;;
    esac
    return 0
  }

  if _do_it_skip_phrase_intended "/do-it-skip gate" || _do_it_skip_phrase_intended "skip gate"; then
    _do_it_skip_add gate
  fi
  if _do_it_skip_phrase_intended "/do-it-skip grill" \
     || _do_it_skip_phrase_intended "skip grill" \
     || [[ "$lc" == *"不用 grill"* || "$lc" == *"不用grill"* ]]; then
    _do_it_skip_add grill
  fi
  if _do_it_skip_phrase_intended "/do-it-skip router" || _do_it_skip_phrase_intended "skip router"; then
    _do_it_skip_add router
  fi

  if ((${#targets[@]} > 0)); then
    printf '%s\n' "${targets[*]}"
    return 0
  fi

  case "$lc" in
    *"/do-it-skip all"*|*"yolo"*|*"just do it"*|*"直接做"*|\
    *"我已经想清楚"*|*"skip do-it"*|*"随便聊"*|*"先聊聊"*|*"just thinking"*)
      printf '%s\n' "router grill gate"
      return 0
      ;;
  esac

  # Bare /do-it-skip command — require word boundary so doc paths like
  # commands/do-it-skip.md do not trigger a full escape.
  if [[ "$lc" =~ /do-it-skip([[:space:]]|$) ]]; then
    printf '%s\n' "router grill gate"
    return 0
  fi

  if declare -p DO_IT_ESCAPE_WORDS >/dev/null 2>&1; then
    if do_it_prompt_has_any "$prompt" DO_IT_ESCAPE_WORDS; then
      printf '%s\n' "router grill gate"
    fi
  fi
}

# Prune session directories untouched for more than DO_IT_SESSION_TTL_DAYS.
# Runs at most once per session (a `.pruned` marker in the current session dir
# guards repeats) and is fully best-effort: every failure stays silent so a
# cleanup problem never blocks a hook. The current session dir is never pruned.
# Args: <session_id> (locates the sessions base; also the dir to spare).
do_it_prune_stale_sessions() {
  local session_id="${1:-}"
  local self base marker
  self="$(do_it_session_dir "$session_id")"
  base="$(dirname "$self")"
  [[ -z "$base" || ! -d "$base" ]] && return 0
  marker="${self}/.pruned"
  [[ -f "$marker" ]] && return 0
  mkdir -p "$self" 2>/dev/null || return 0
  : > "$marker" 2>/dev/null || true

  # `-mtime +N` / `-mtime -N` are portable across BSD and GNU find. The cheap
  # dir-mtime filter runs first; the inner scan only confirms candidates, and
  # catches jq-less `state.kv` appends that bump a file mtime but not the dir.
  find "$base" -maxdepth 1 -mindepth 1 -type d \
       -mtime "+${DO_IT_SESSION_TTL_DAYS}" 2>/dev/null \
    | while IFS= read -r d; do
        [[ "$d" == "$self" ]] && continue
        if [[ -n "$(find "$d" -mtime "-${DO_IT_SESSION_TTL_DAYS}" 2>/dev/null | head -n1)" ]]; then
          continue
        fi
        rm -rf "$d" 2>/dev/null || true
      done
  return 0
}

# Lower-case a string portably.
do_it_lc() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# Explicit user action boundaries are session state, not a best-effort prose
# hint. Keep recognition deliberately narrow: this detects a request to defer
# implementation, not ordinary discussion of an unchanged file.
# Args: <prompt>. Returns 0 when the user has explicitly asked for no writes.
do_it_prompt_requests_no_write() {
  local lc
  lc="$(do_it_lc "$1")"
  case "$lc" in
    *"先不改"*|*"先别改"*|*"暂不改"*|*"不要改"*|*"不改代码"*|\
    *"不修改代码"*|*"先不实施"*|*"不实施"*|*"只审查"*|*"只做计划"*|\
    *"do not edit"*|*"don't edit"*|*"do not implement"*|\
    *"don't implement"*|*"no code changes"*|*"plan only"*|\
    *"review only"*|*"read only"*|*"read-only"*)
      return 0
      ;;
  esac
  return 1
}

# Args: <prompt>. Returns 0 only for an explicit reversal of a previously
# requested no-write boundary. A generic "continue" is intentionally not a
# reversal: it may mean continue the investigation or plan. A question such as
# "现在可以改吗？" asks whether implementation may resume; it does not grant
# that permission.
do_it_prompt_reopens_writes() {
  local lc
  do_it_prompt_is_question "$1" && return 1
  lc="$(do_it_lc "$1")"
  case "$lc" in
    *"现在可以改"*|*"现在可以开始"*"实现"*|*"可以开始实现"*|\
    *"可以实施"*|*"开始修改"*|*"开始改代码"*|\
    *"now you can edit"*|*"you can edit now"*|\
    *"go ahead and edit"*|*"go ahead and implement"*|\
    *"proceed with implementation"*|*"make the changes now"*)
      return 0
      ;;
  esac
  return 1
}

# Internal: detect whether a term is pure ASCII (printable + space). CJK and
# other multi-byte content fall through to substring matching.
_do_it_term_is_ascii() {
  # Avoid grep -q under pipefail (MSYS aborts with SIGPIPE).
  ! printf '%s' "$1" | LC_ALL=C grep '[^[:print:]]' >/dev/null 2>&1
}

# Pure-bash ASCII word-boundary match (Git Bash / MSYS safe; no grep).
# Args: <lowercased-prompt> <lowercased-term>. Returns 0 on match.
_do_it_prompt_has_word_bash() {
  local lc="$1" lcw="$2"
  local padded
  # Map non-word chars to spaces, then look for a whole-word token.
  padded=" ${lc//[^a-zA-Z0-9_]/ } "
  case "$padded" in
    *" $lcw "*) return 0 ;;
  esac
  return 1
}

# Word-boundary match against the prompt for a single ASCII term.
# Args: <lowercased-prompt> <lowercased-term>. Returns 0 on match.
do_it_prompt_has_word() {
  local lc="$1" lcw="$2"
  # Git Bash / MSYS: grep -qiwF under set -o pipefail floods "Aborted" and is slow.
  if _do_it_is_msys; then
    _do_it_prompt_has_word_bash "$lc" "$lcw"
    return $?
  fi
  # Prefer grep without -q so the writer is not SIGPIPE'd on early exit.
  if printf '%s' "$lc" | grep -iwF -- "$lcw" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

_do_it_prompt_has_any_values() {
  local prompt="$1"
  shift
  local lc
  lc="$(do_it_lc "$prompt")"
  local word lcw
  for word in "$@"; do
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

# Test if any keyword from a known hook keyword array appears in the prompt.
# - Pure-ASCII terms: word-boundary match (so `fix` does not match `prefix`).
# - CJK / mixed terms: case-insensitive substring (CJK has no word boundaries).
# Args: <prompt> <array-name>.
do_it_prompt_has_any() {
  local prompt="$1" __do_it_array_name="$2"
  case "$__do_it_array_name" in
    DO_IT_INTENT_VERBS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_INTENT_VERBS[@]+"${DO_IT_INTENT_VERBS[@]}"}" ;;
    DO_IT_UNCERTAINTY_WORDS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_UNCERTAINTY_WORDS[@]+"${DO_IT_UNCERTAINTY_WORDS[@]}"}" ;;
    DO_IT_HEAVY_SIGNALS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_HEAVY_SIGNALS[@]+"${DO_IT_HEAVY_SIGNALS[@]}"}" ;;
    DO_IT_LIGHT_SIGNALS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_LIGHT_SIGNALS[@]+"${DO_IT_LIGHT_SIGNALS[@]}"}" ;;
    DO_IT_ESCAPE_WORDS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_ESCAPE_WORDS[@]+"${DO_IT_ESCAPE_WORDS[@]}"}" ;;
    DO_IT_LONG_INPUT_HINTS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_LONG_INPUT_HINTS[@]+"${DO_IT_LONG_INPUT_HINTS[@]}"}" ;;
    DO_IT_QUESTION_HINTS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_QUESTION_HINTS[@]+"${DO_IT_QUESTION_HINTS[@]}"}" ;;
    DO_IT_INTENT_OBJECTS)
      _do_it_prompt_has_any_values "$prompt" "${DO_IT_INTENT_OBJECTS[@]+"${DO_IT_INTENT_OBJECTS[@]}"}" ;;
    *)
      return 1
      ;;
  esac
}

# Convenience wrapper: non-empty parse result means an escape/skip target matched.
do_it_prompt_has_escape() {
  [[ -n "$(do_it_parse_skip_targets "$1")" ]]
}

# Detect whether the hook is running inside a subagent / delegated agent
# context. When true the caller should NOT inject another tier banner —
# subagents inherit context from the parent and re-injection just burns
# tokens. Returns 0 when in a subagent context, 1 otherwise.
#
# Signal sources (any one is sufficient):
#   - PI_SUBAGENT_CHILD=1 (pi-subagents child-process contract)
#   - CLAUDE_AGENT_CONTEXT non-empty
#   - CLAUDE_SUBAGENT non-empty
#   - explicit transcript_path argument contains an `/agents/` or `/subagents/`
#     segment after normalizing Windows separators
#     (the host actually delivers transcript_path on stdin JSON, not as an
#     env var; callers should read it from the JSON payload and pass it
#     here)
#   - $transcript_path env var contains `/agents/` or `/subagents/` (best-effort, NOT
#     guaranteed by the host — kept only as a last-resort signal for
#     environments that happen to export it)
#
# Args: [transcript_path] (optional). When omitted, only env signals fire.
do_it_in_subagent_context() {
  local tp_arg="${1:-}"
  local tp_normalized="${tp_arg//\\//}"
  local env_tp_normalized="${transcript_path:-}"
  env_tp_normalized="${env_tp_normalized//\\//}"
  if [[ "${PI_SUBAGENT_CHILD:-}" == "1" ]]; then
    return 0
  fi
  if [[ -n "${CLAUDE_AGENT_CONTEXT:-}" ]]; then
    return 0
  fi
  if [[ -n "${CLAUDE_SUBAGENT:-}" ]]; then
    return 0
  fi
  if [[ -n "$tp_normalized" && ( "$tp_normalized" == *"/agents/"* || "$tp_normalized" == *"/subagents/"* ) ]]; then
    return 0
  fi
  # Best-effort env fallback. Host is not contractually required to export
  # transcript_path; this branch only fires if the surrounding shell
  # happened to set it.
  if [[ -n "$env_tp_normalized" && ( "$env_tp_normalized" == *"/agents/"* || "$env_tp_normalized" == *"/subagents/"* ) ]]; then
    return 0
  fi
  if [[ -n "${CURSOR_SUBAGENT:-}" || -n "${CURSOR_AGENT_CONTEXT:-}" ]]; then
    return 0
  fi
  return 1
}

# Bump per-session user-turn counter (router calls on work prompts).
do_it_user_turn_bump() {
  do_it_session_state_bump "$1" user_turn
}

do_it_user_turn_get() {
  local session_id="$1"
  local turn
  turn="$(do_it_session_state_get "$session_id" user_turn)"
  case "$turn" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$turn" ;;
  esac
}

# Detect whether the prompt names a "code object" — a concrete file, path,
# fenced snippet, or technical noun like `function`/`schema`/`组件`.
# Used by router.sh to distinguish "实施 + 代码对象" (Standard) from a bare
# intent verb like "修改" with no object (Light fallback).
#
# Match sources:
#   - file extensions (.ts/.tsx/.py/.go/.rs/...)
#   - path-like substring with `/`
#   - fenced/inline backticks
#   - any term in DO_IT_INTENT_OBJECTS (loaded from intent-objects.tsv)
# Returns 0 on hit, 1 otherwise.
do_it_prompt_has_code_object() {
  local prompt="$1"
  [[ -z "$prompt" ]] && return 1
  local lc
  lc="$(do_it_lc "$prompt")"

  # File extension on a word boundary.
  if printf '%s' "$lc" \
       | grep -Eq '\.(ts|tsx|js|jsx|py|go|rs|java|rb|cpp|c|h|md|json|yaml|yml|toml|sh)([[:space:]]|$|[^[:alnum:]_])'; then
    return 0
  fi

  # Path-like: a `/` with a non-whitespace neighbour on each side. The
  # `[^[:space:]]/[^[:space:]]` test guards against bare slashes used as
  # punctuation ("a / b").
  if printf '%s' "$prompt" | grep -Eq '[^[:space:]]/[^[:space:]]'; then
    return 0
  fi

  # Backtick / fenced code marker.
  case "$prompt" in
    *'`'*) return 0 ;;
  esac

  # Curated technical noun list, if loaded.
  if declare -p DO_IT_INTENT_OBJECTS >/dev/null 2>&1; then
    if do_it_prompt_has_any "$prompt" DO_IT_INTENT_OBJECTS; then
      return 0
    fi
  fi

  return 1
}

# Detect whether the current turn is question-shaped. The router may classify
# a genuinely informational question Light, but direct task intent and
# high-consequence actions still win. Triggered by:
#   - any term in DO_IT_QUESTION_HINTS
#   - prompt ends with `?`, `？`, `吗？`, `呢？`, `吗?`, or `呢?` (after trim)
do_it_prompt_is_question() {
  local prompt="$1"
  if do_it_prompt_has_any "$prompt" DO_IT_QUESTION_HINTS; then
    return 0
  fi
  local trimmed="$prompt"
  trimmed="${trimmed%[[:space:]]}"
  trimmed="${trimmed%[[:space:]]}"
  case "$trimmed" in
    *'?'|*'？'|*'吗？'|*'呢？'|*'吗?'|*'呢?') return 0 ;;
  esac
  return 1
}

# Internal: run a block under a per-session advisory lock so that concurrent
# hook processes do not lose read-modify-write state updates.
#
# `flock` is preferred. Minimal/macOS hosts fall back to POSIX `mkdir`, whose
# create is atomic across processes. The owner removes the lock directory on
# return. A bounded stale-lock recovery handles a hook killed before cleanup;
# timeout remains fail-open because advisory hooks must never block the user.
# Args: <lock-path> <command...>
_do_it_release_mkdir_lock() {
  local lock_dir="$1" token="$2" current=""
  current="$(cat "$lock_dir/owner" 2>/dev/null)"
  [[ -n "$token" && "$current" == "$token" ]] || return 1
  rm -f "$lock_dir/owner" 2>/dev/null || return 1
  rmdir "$lock_dir" 2>/dev/null
}

_do_it_with_state_lock() {
  local lock="$1"; shift
  if command -v flock >/dev/null 2>&1; then
    {
      flock -w 5 9 || return 1
      "$@"
    } 9>"$lock"
    return $?
  fi

  local lock_dir="${lock}.d" reaping="${lock}.d.reaping"
  local acquired=0 attempts=0 now=0 modified=0 owner_record="" owner_pid="" token="" stale=0
  # Portable lock-wait delay: GNU sleep accepts fractional seconds, BSD/macOS
  # sleep does not. Probe once, then size the attempt bound so the total wait
  # is ~5s on every host (matching the flock -w 5 timeout above). Scalar vars
  # only — this must parse on macOS's default bash 3.2.
  local _lock_delay=1 _lock_bound=5
  if sleep 0.01 2>/dev/null; then
    _lock_delay=0.01
    _lock_bound=500
  fi
  while [[ "$attempts" -lt "$_lock_bound" ]]; do
    if [[ -d "$reaping" ]]; then
      now=$(date +%s 2>/dev/null || printf '0')
      modified=$(stat -f %m "$reaping" 2>/dev/null || stat -c %Y "$reaping" 2>/dev/null || printf '0')
      if [[ "$now" =~ ^[0-9]+$ && "$modified" =~ ^[0-9]+$ \
         && "$modified" -gt 0 && $((now - modified)) -gt 30 ]]; then
        rm -f "$reaping/owner" 2>/dev/null || true
        rmdir "$reaping" 2>/dev/null || true
      fi
      attempts=$((attempts + 1))
      sleep "$_lock_delay"
      continue
    fi

    if mkdir "$lock_dir" 2>/dev/null; then
      owner_pid="${BASHPID:-}"
      [[ -n "$owner_pid" ]] || owner_pid="$(sh -c 'printf "%s\n" "$PPID"' 2>/dev/null)"
      [[ "$owner_pid" =~ ^[0-9]+$ ]] || owner_pid="$$"
      token="${owner_pid}:${RANDOM}:${RANDOM}"
      if ! printf '%s\n' "$token" > "$lock_dir/owner" 2>/dev/null; then
        rmdir "$lock_dir" 2>/dev/null || true
        return 1
      fi
      if [[ -d "$reaping" ]]; then
        _do_it_release_mkdir_lock "$lock_dir" "$token" || true
        attempts=$((attempts + 1))
        sleep "$_lock_delay"
        continue
      fi
      acquired=1
      break
    fi

    attempts=$((attempts + 1))
    owner_record="$(cat "$lock_dir/owner" 2>/dev/null)"
    owner_pid="${owner_record%%:*}"
    stale=0
    if [[ "$owner_pid" =~ ^[0-9]+$ ]]; then
      if ! kill -0 "$owner_pid" 2>/dev/null; then
        stale=1
      fi
    elif [[ $((attempts % 100)) -eq 0 ]]; then
      now=$(date +%s 2>/dev/null || printf '0')
      modified=$(stat -f %m "$lock_dir" 2>/dev/null || stat -c %Y "$lock_dir" 2>/dev/null || printf '0')
      if [[ "$now" =~ ^[0-9]+$ && "$modified" =~ ^[0-9]+$ \
         && "$modified" -gt 0 && $((now - modified)) -gt 30 ]]; then
        stale=1
      fi
    fi
    if [[ "$stale" -eq 1 ]] && mkdir "$reaping" 2>/dev/null; then
      local current_record current_pid current_stale=0
      current_record="$(cat "$lock_dir/owner" 2>/dev/null)"
      current_pid="${current_record%%:*}"
      if [[ "$current_record" == "$owner_record" ]]; then
        if [[ "$current_pid" =~ ^[0-9]+$ ]]; then
          kill -0 "$current_pid" 2>/dev/null || current_stale=1
        else
          now=$(date +%s 2>/dev/null || printf '0')
          modified=$(stat -f %m "$lock_dir" 2>/dev/null || stat -c %Y "$lock_dir" 2>/dev/null || printf '0')
          if [[ "$now" =~ ^[0-9]+$ && "$modified" =~ ^[0-9]+$ \
             && "$modified" -gt 0 && $((now - modified)) -gt 30 ]]; then
            current_stale=1
          fi
        fi
      fi
      if [[ "$current_stale" -eq 1 ]]; then
        rm -f "$lock_dir/owner" 2>/dev/null || true
        rmdir "$lock_dir" 2>/dev/null || true
      fi
      rmdir "$reaping" 2>/dev/null || true
      continue
    fi
    sleep "$_lock_delay"
  done
  [[ "$acquired" -eq 1 ]] || return 1

  "$@"
  local status=$?
  if ! _do_it_release_mkdir_lock "$lock_dir" "$token" && [[ "$status" -eq 0 ]]; then
    status=1
  fi
  return "$status"
}
# Internal: emit a one-shot stderr warning when an atomic state-file rename
# fails. A marker file inside the session dir suppresses repeats so we never
# spam the user's terminal. Args: <state-path> <message>.
_do_it_warn_state_corruption() {
  local state="$1" msg="$2"
  local dir
  dir="$(dirname "$state")"
  local marker="${dir}/.state-warn"
  if [[ ! -f "$marker" ]]; then
    : > "$marker" 2>/dev/null || true
    printf 'do-it: %s (state=%s)\n' "$msg" "$state" >&2
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

# Internal: jq-backed set. Caller holds the session lock.
_do_it_session_state_set_locked() {
  local state="$1" key="$2" value="$3"
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$state" ]]; then
    if ! jq -c --arg k "$key" --arg v "$value" '. + {($k): $v}' "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: jq update failed"
      return 1
    fi
  else
    if ! jq -nc --arg k "$key" --arg v "$value" '{($k): $v}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: jq init failed"
      return 1
    fi
  fi
  if ! mv -f "$tmp" "$state" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$state" "session state set: atomic rename failed"
    return 1
  fi
}

# Internal: append one or more key/value pairs to the jq-free state log, then
# atomically publish the complete snapshot. Caller holds the session lock.
_do_it_session_state_append_kv_locked() {
  local kv="$1"; shift
  local tmp="${kv}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$kv" ]]; then
    if ! cat "$kv" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$kv" "session state kv: snapshot copy failed"
      return 1
    fi
  elif ! : > "$tmp" 2>/dev/null; then
    _do_it_warn_state_corruption "$kv" "session state kv: snapshot init failed"
    return 1
  fi
  while (( $# >= 2 )); do
    if ! printf '%s=%s\n' "$1" "$2" >> "$tmp"; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$kv" "session state kv: snapshot update failed"
      return 1
    fi
    shift 2
  done
  if ! mv -f "$tmp" "$kv" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$kv" "session state kv: atomic rename failed"
    return 1
  fi
}

# Write a value to session state. Last-write wins. Args: <session_id> <key>
# <value>. Return nonzero when the state update cannot be committed.
do_it_session_state_set() {
  local session_id="$1" key="$2" value="$3" dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_set_locked "$state" "$key" "$value"
    return $?
  fi
  _do_it_with_state_lock "$dir/.state.lock" \
    _do_it_session_state_append_kv_locked "$dir/state.kv" "$key" "$value"
}

# Internal: jq-backed batched set. Caller holds the session lock.
_do_it_session_state_set_many_locked() {
  local state="$1"; shift
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  local jq_args=() kv_parts=()
  local i=0 k v
  while (( $# >= 2 )); do
    k="$1"; v="$2"; shift 2
    jq_args+=(--arg "k$i" "$k" --arg "v$i" "$v")
    kv_parts+=("(\$k$i): \$v$i")
    i=$((i + 1))
  done
  local kv_obj
  kv_obj=$(IFS=','; printf '%s' "${kv_parts[*]}")
  local jq_filter=". // {} | . + {${kv_obj}}"
  if [[ -f "$state" ]]; then
    if ! jq -c "${jq_args[@]}" "$jq_filter" "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set-many: jq update failed"
      return 1
    fi
  else
    if ! jq -nc "${jq_args[@]}" "$jq_filter" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set-many: jq init failed"
      return 1
    fi
  fi
  if ! mv -f "$tmp" "$state" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$state" "session state set-many: atomic rename failed"
    return 1
  fi
}

# Batched write: one lock + one jq + one atomic rename for many keys.
# Args: <session_id> <k1> <v1> [<k2> <v2> ...].
do_it_session_state_set_many() {
  local session_id="$1"; shift
  if (( $# == 0 )) || (( $# % 2 != 0 )); then
    return 1
  fi
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_set_many_locked "$state" "$@"
    return $?
  fi
  _do_it_with_state_lock "$dir/.state.lock" \
    _do_it_session_state_append_kv_locked "$dir/state.kv" "$@"
}

# Internal: jq-backed nested counter increment. Caller holds the session lock.
_do_it_session_state_inc_locked() {
  local state="$1" bucket="$2" name="$3"
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$state" ]]; then
    if ! jq -c --arg b "$bucket" --arg n "$name" \
         '.[$b] = ((.[$b] // {}) | (.[$n] = ((.[$n] // 0) | tonumber + 1)))' \
         "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state inc: jq update failed"
      return 1
    fi
  else
    if ! jq -nc --arg b "$bucket" --arg n "$name" '{($b): {($n): 1}}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state inc: jq init failed"
      return 1
    fi
  fi
  if ! mv -f "$tmp" "$state" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$state" "session state inc: atomic rename failed"
    return 1
  fi
}

# Internal: increment one top-level numeric key in state.json while the caller
# holds the session lock. Args: <state-path> <key>.
_do_it_session_state_bump_locked() {
  local state="$1" key="$2"
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$state" ]]; then
    if ! jq -c --arg k "$key" '.[$k] = ((.[$k] // 0) | tonumber + 1)' \
         "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state bump: jq update failed"
      return 1
    fi
  else
    if ! jq -nc --arg k "$key" '{($k): 1}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state bump: jq init failed"
      return 1
    fi
  fi
  if ! mv -f "$tmp" "$state" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$state" "session state bump: atomic rename failed"
    return 1
  fi
}

# Internal: increment one flat state.kv key while the caller holds the session
# lock. Args: <kv-path> <key>.
_do_it_session_state_bump_kv_locked() {
  local kv="$1" key="$2" prev
  prev="$(grep -E "^${key}=" "$kv" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  case "$prev" in
    ''|*[!0-9]*) prev=0 ;;
  esac
  _do_it_session_state_append_kv_locked "$kv" "$key" "$((prev + 1))"
}

# Atomically increment one top-level numeric session key. Args: <session_id>
# <key>. Both jq-backed and jq-free paths share the same session lock.
do_it_session_state_bump() {
  local session_id="$1" key="$2" dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_bump_locked "$state" "$key"
    return $?
  fi
  _do_it_with_state_lock "$dir/.state.lock" \
    _do_it_session_state_bump_kv_locked "$dir/state.kv" "$key"
}

# Increment a numeric counter sub-key in session state. Args: <session_id>
# <bucket-key> <counter-name>. Without jq it degrades to a flat key.
do_it_session_state_inc() {
  local session_id="$1" bucket="$2" name="$3" dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_inc_locked "$state" "$bucket" "$name"
    return $?
  fi
  _do_it_with_state_lock "$dir/.state.lock" \
    _do_it_session_state_bump_kv_locked "$dir/state.kv" "${bucket}.${name}"
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

# Internal: escape a string for embedding inside a JSON string literal. Used by
# the jq-free fallback of do_it_emit_context so that a host without jq still
# receives valid JSON instead of an empty (dropped) reminder.
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
# Kimi Code does not parse hookSpecificOutput.additionalContext: stdout is
# appended to context verbatim (wrapped in <hook_result>). Emit plain text on
# that host; the JSON envelope is for Claude-shaped hosts.
do_it_emit_context() {
  local event="$1" text="$2"
  if [[ "${DO_IT_CONTEXT_OUTPUT:-}" == "plain" \
     || -n "${KIMI_CODE_HOME:-}" || -n "${KIMI_PLUGIN_ROOT:-}" ]]; then
    printf '%s\n' "$text"
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


# Project-level keyword overrides. Implementation lives beside _do_it_load_tsv
# in keywords.sh; this thin wrapper keeps the historical common.sh entrypoint.
do_it_source_local_keywords() {
  _do_it_source_local_keywords "$@"
}
