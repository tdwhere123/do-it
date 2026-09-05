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
#   8. ${TMPDIR:-/tmp}/do-it-sessions
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
    base="${TMPDIR:-/tmp}/do-it-sessions"
  fi

  printf '%s/%s' "$base" "$key"
}

# Compact context delivery. Native host policy owns permissions.
do_it_kernel_body() {
  printf '%s' 'Do-it: preserve the user goal, settled decisions, and authorization boundary, including review-only and no-write scope; prior authorization remains valid; work from current facts and distinguish assumptions; fix the causal owner with necessary scope; support claims with relevant actual evidence and name gaps. Choose useful skills directly. Independent contexts can test assumptions; the parent integrates and verifies.'
}

# Deliver once per session. User intent remains in the conversation; this helper
# never infers or stores authorization from prompt phrases.
do_it_kernel_context_collect() {
  local session_id="${1:-}" transcript="${4:-}" kernel_body last_kernel
  if do_it_in_subagent_context "$transcript"; then return 0; fi
  kernel_body="$(do_it_kernel_body)"
  last_kernel="$(do_it_session_state_get "$session_id" kernel_text)"
  if [[ "$last_kernel" != "$kernel_body" ]]; then
    printf '%s' "$kernel_body"
    do_it_session_state_set "$session_id" kernel_text "$kernel_body" 2>/dev/null || true
  fi
  return 0
}

# Age (in days) past which an inactive session directory is pruned by
# do_it_prune_stale_sessions. Session dirs accumulate one bucket per repo /
# session id and are never otherwise cleaned up.
DO_IT_SESSION_TTL_DAYS="${DO_IT_SESSION_TTL_DAYS:-7}"

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
#
# Match sources:
#   - file extensions (.ts/.tsx/.py/.go/.rs/...)
#   - path-like substring with `/`
#   - fenced/inline backticks
#   - any term in DO_IT_INTENT_OBJECTS (loaded from intent-objects.tsv)
# Returns 0 on hit, 1 otherwise.
_do_it_release_mkdir_lock() {
  local lock_dir="$1" token="$2" current=""
  current="$(cat "$lock_dir/owner" 2>/dev/null)"
  [[ -n "$token" && "$current" == "$token" ]] || return 1
  rm -f "$lock_dir/owner" 2>/dev/null || return 1
  # A waiter may reclaim the (stale-looking) dir between our rm and rmdir; the
  # critical section is already over, so a missing dir is a successful release.
  rmdir "$lock_dir" 2>/dev/null || [[ ! -d "$lock_dir" ]]
}

_do_it_with_state_lock() {
  local lock="$1"; shift
  # Git Bash ships a flock executable that can block on mixed Windows/POSIX
  # paths; the mkdir lock below preserves the portable fallback contract.
  if [[ "${OSTYPE:-}" != msys* && "${OSTYPE:-}" != cygwin* ]] \
    && command -v flock >/dev/null 2>&1; then
    {
      flock -w 5 9 || return 1
      "$@"
    } 9>"$lock"
    return $?
  fi

  local lock_dir="${lock}.d" reaping="${lock}.d.reaping"
  local acquired=0 attempts=0 now=0 modified=0 owner_record="" owner_pid="" token="" stale=0
  # Portable lock-wait. Budget by wall time (bash builtin SECONDS, available
  # on bash 3.2) because per-attempt cost varies across hosts. The budget is a
  # safety net; normal contention is millisecond-scale and dead owners are
  # reclaimed immediately. A large no-flock waiter set takes over 30s on
  # hosted macOS, so Darwin gets a wider bound. Scalar vars only for bash 3.2.
  local _lock_start=$SECONDS _lock_delay="spin" _lock_budget=30
  [[ "${OSTYPE:-}" == darwin* ]] && _lock_budget=60
  if sleep 0.01 2>/dev/null; then
    _lock_delay=0.01
  fi
  while [[ $((SECONDS - _lock_start)) -lt "$_lock_budget" ]]; do
    if [[ -d "$reaping" ]]; then
      now=$(date +%s 2>/dev/null || printf '0')
      modified=$(stat -f %m "$reaping" 2>/dev/null || stat -c %Y "$reaping" 2>/dev/null || printf '0')
      if [[ "$now" =~ ^[0-9]+$ && "$modified" =~ ^[0-9]+$ \
         && "$modified" -gt 0 && $((now - modified)) -gt 30 ]]; then
        rm -f "$reaping/owner" 2>/dev/null || true
        rmdir "$reaping" 2>/dev/null || true
      fi
      attempts=$((attempts + 1))
      if [[ "$_lock_delay" == "spin" ]]; then
      :  # spin-poll: mkdir retry loop is the wait on hosts without fractional sleep
    else
      sleep "$_lock_delay"
    fi
      continue
    fi

    if mkdir "$lock_dir" 2>/dev/null; then
      # Owner identity for stale-reclaim. Prefer BASHPID (the current
      # subshell's own pid, alive for the whole critical section). Bash 3.2
      # (macOS default) has no BASHPID: fall back to $$ — the session shell's
      # pid, alive for the whole process run. NEVER fall back to a transient
      # pid (e.g. a `sh -c` PPID): command-substitution subshells die
      # immediately after the owner file is written, so waiters would see a
      # dead owner and steal a live lock (observed as lost increments under
      # heavy contention on bash 3.2).
      owner_pid="${BASHPID:-$$}"
      [[ "$owner_pid" =~ ^[0-9]+$ ]] || owner_pid="$$"
      token="${owner_pid}:${RANDOM}:${RANDOM}"
      if ! printf '%s\n' "$token" > "$lock_dir/owner" 2>/dev/null; then
        # Owner-write failed. Two cases:
        #  (a) a concurrent reclaim removed the dir between our mkdir and this
        #      write — the path is free, retry the acquisition loop;
        #  (b) the path is unusable for the owner file (observed on Windows/
        #      Git Bash with mixed paths) — the dir is still ours and empty,
        #      so release it and fail fast instead of spinning the whole wait
        #      budget. Never rmdir a dir that has gained another writer's
        #      owner file.
        if [[ -d "$lock_dir" && ! -e "$lock_dir/owner" ]]; then
          rmdir "$lock_dir" 2>/dev/null || true
          return 1
        fi
        attempts=$((attempts + 1))
        if [[ "$_lock_delay" == "spin" ]]; then
          :  # spin-poll: mkdir retry loop is the wait on hosts without fractional sleep
        else
          sleep "$_lock_delay"
        fi
        continue
      fi
      # No step-aside: once mkdir succeeds the lock is ours. A concurrent
      # reaping dir belongs to a reclaim in flight; it clears itself within
      # the wait budget, and releasing a fresh lock here only churns the
      # acquisition loop (observed as lost increments under heavy contention).
      acquired=1
      break
    fi

    attempts=$((attempts + 1))
    # Full owner check only every 20 attempts: each cat + kill -0 is a
    # subprocess, and on slow hosts (macOS, containers) per-attempt cost is
    # what burns the wait budget. Between checks the mkdir retry alone is the
    # poll; a released lock is re-acquired on the next mkdir regardless.
    stale=0
    if [[ $((attempts % 20)) -eq 0 ]]; then
      owner_record="$(cat "$lock_dir/owner" 2>/dev/null)"
      owner_pid="${owner_record%%:*}"
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
          # Final identity check immediately before removal. The owner file
          # must still carry the stale token: never remove a dir whose owner
          # is empty (a fresh acquirer may be between mkdir and owner-write,
          # or a live owner between its rm and rmdir — the Case 3d window).
          final_record="$(cat "$lock_dir/owner" 2>/dev/null)"
          if [[ -n "$final_record" && "$final_record" == "$current_record" ]]; then
            rm -f "$lock_dir/owner" 2>/dev/null || true
            rmdir "$lock_dir" 2>/dev/null || true
          fi
        fi
        rmdir "$reaping" 2>/dev/null || true
        continue
      fi
    fi
    if [[ "$_lock_delay" == "spin" ]]; then
      :  # spin-poll: mkdir retry loop is the wait on hosts without fractional sleep
    else
      sleep "$_lock_delay"
    fi
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
