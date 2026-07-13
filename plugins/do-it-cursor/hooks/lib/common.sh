#!/usr/bin/env bash
# do-it hook shared helpers. Source from each hook script as:
#   source "${SCRIPT_DIR}/lib/common.sh"
#   source "${SCRIPT_DIR}/lib/keywords.sh"
#
# Helpers degrade gracefully when jq is unavailable: most return ""/exit 0,
# while do_it_emit_* fall back to hand-built JSON so Stop-hook decisions and
# context reminders still reach the host. A misconfigured environment never
# crashes a hook.

set -uo pipefail

if command -v jq >/dev/null 2>&1; then
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
# `<repo>/.do-it/runtime/`; placing `.gitignore` with body `*` at that path
# tells git to ignore everything inside it.
#
# Args: <runtime_dir> (e.g. `<repo_root>/.do-it/runtime`).
# Idempotent and best-effort; failures stay silent.
_do_it_ensure_runtime_gitignore() {
  local runtime_dir="$1"
  [[ -z "$runtime_dir" || ! -d "$runtime_dir" ]] && return 0
  local marker="${runtime_dir}/.gitignore"
  # Memoize: once written, do not re-stat / re-write on every hook call.
  [[ -f "$marker" ]] && return 0
  printf '%s\n' '*' '!.gitignore' > "$marker" 2>/dev/null || return 0
}

# Compute a session-scoped data dir. Caller is responsible for mkdir.
# Resolution order:
#   1. $CURSOR_PLUGIN_DATA/sessions   (Cursor plugin data)
#   2. $CLAUDE_PLUGIN_DATA/sessions   (host-provided plugin data)
#   3. $PLUGIN_DATA/sessions          (Codex plugin data; also set via DO_IT_HOOK_DATA in hooks.json)
#   4. $DO_IT_HOOK_DATA/sessions      (explicit override / wrapped PLUGIN_DATA)
#   5. $OPENCODE_DATA/sessions        (OpenCode plugin data)
#   6. $CODEX_HOME/do-it-data/sessions
#   7. <git repo root>/.do-it/runtime/sessions
#   8. ${TMPDIR:-/tmp}/do-it-sessions
# A writable check guards (1)–(4) so an unwritable mount silently falls
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

# Age (in days) past which an inactive session directory is pruned by
# do_it_prune_stale_sessions. Session dirs accumulate one bucket per repo /
# session id and are never otherwise cleaned up.
DO_IT_SESSION_TTL_DAYS="${DO_IT_SESSION_TTL_DAYS:-7}"

# Test if skip flag is set. 0 = present (and not expired), 1 = absent.
# Empty legacy flag files expire by file mtime after DO_IT_SKIP_TTL_SECONDS.
# Timestamped flag files expire when body age exceeds DO_IT_SKIP_TTL_SECONDS.
do_it_check_skip() {
  local session_id="$1" flag="$2"
  local p
  p="$(do_it_skip_flag_path "$session_id" "$flag")"
  [[ -f "$p" ]] || return 1
  local ts now age mtime
  now=$(date +%s 2>/dev/null)
  if [[ ! -s "$p" ]]; then
    mtime=$(stat -c %Y "$p" 2>/dev/null || stat -f %m "$p" 2>/dev/null || echo "")
    if [[ -z "$mtime" || -z "$now" ]]; then
      rm -f "$p" 2>/dev/null || true
      return 1
    fi
    age=$((now - mtime))
    if (( age < 0 )); then
      return 0
    fi
    if (( age > DO_IT_SKIP_TTL_SECONDS )); then
      rm -f "$p" 2>/dev/null || true
      return 1
    fi
    return 0
  fi
  ts="$(head -n1 "$p" 2>/dev/null | tr -dc '0-9')"
  if [[ -z "$ts" ]]; then
    rm -f "$p" 2>/dev/null || true
    return 1
  fi
  if [[ -z "$now" ]]; then
    return 0
  fi
  age=$((now - ts))
  if (( age < 0 )); then
    return 0
  fi
  if (( age > DO_IT_SKIP_TTL_SECONDS )); then
    rm -f "$p" 2>/dev/null || true
    return 1
  fi
  return 0
}

# Write skip flag(s). Args: <session_id> [flag1 flag2 ...]. Default: all three.
# Each flag file contains the current unix timestamp so do_it_check_skip can
# expire it after DO_IT_SKIP_TTL_SECONDS.
do_it_write_skip() {
  local session_id="$1"; shift
  local dir
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 0
  if [[ $# -eq 0 ]]; then
    set -- router grill gate
  fi
  local now
  now=$(date +%s 2>/dev/null)
  for flag in "$@"; do
    if [[ -n "$now" ]]; then
      printf '%s\n' "$now" > "$dir/skip-${flag}" 2>/dev/null || true
    else
      : > "$dir/skip-${flag}" 2>/dev/null || true
    fi
  done
}

# Remove all skip flags for a session (router / grill / gate). Called after the
# Stop verification-gate consumes or finishes a turn so skip scope stays one turn.
do_it_clear_skip() {
  local session_id="$1"
  local dir flag
  dir="$(do_it_session_dir "$session_id")"
  for flag in router grill gate; do
    rm -f "$dir/skip-${flag}" 2>/dev/null || true
  done
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
#   - CLAUDE_AGENT_CONTEXT non-empty
#   - CLAUDE_SUBAGENT non-empty
#   - explicit transcript_path argument contains an `/agents/` segment
#     (the host actually delivers transcript_path on stdin JSON, not as an
#     env var; callers should read it from the JSON payload and pass it
#     here)
#   - $transcript_path env var contains `/agents/` (best-effort, NOT
#     guaranteed by the host — kept only as a last-resort signal for
#     environments that happen to export it)
#
# Args: [transcript_path] (optional). When omitted, only env signals fire.
do_it_in_subagent_context() {
  local tp_arg="${1:-}"
  if [[ -n "${CLAUDE_AGENT_CONTEXT:-}" ]]; then
    return 0
  fi
  if [[ -n "${CLAUDE_SUBAGENT:-}" ]]; then
    return 0
  fi
  if [[ -n "$tp_arg" && "$tp_arg" == *"/agents/"* ]]; then
    return 0
  fi
  # Best-effort env fallback. Host is not contractually required to export
  # transcript_path; this branch only fires if the surrounding shell
  # happened to set it.
  if [[ -n "${transcript_path:-}" && "${transcript_path}" == *"/agents/"* ]]; then
    return 0
  fi
  if [[ -n "${CURSOR_SUBAGENT:-}" || -n "${CURSOR_AGENT_CONTEXT:-}" ]]; then
    return 0
  fi
  return 1
}

# Bump per-session user-turn counter (router calls on work prompts).
do_it_user_turn_bump() {
  local session_id="$1"
  local prev
  prev="$(do_it_session_state_get "$session_id" user_turn)"
  case "$prev" in
    ''|*[!0-9]*) prev=0 ;;
  esac
  do_it_session_state_set "$session_id" user_turn "$((prev + 1))"
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

# Detect whether the current turn is a question / discussion (router caps at
# Light, grill hook suppressed). Triggered by:
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
# UserPromptSubmit hooks (router + grill-prompt) do not clobber each other's
# state.json writes.
#
# Locking strategy:
#   - flock available (the common case): hold an exclusive fd-9 lock around
#     the callee, so writers serialize on `state.json` and tmp-file naming
#     does not need to be unique.
#   - flock unavailable (legacy/minimal hosts, or when the test harness stubs
#     `command -v`): fall back to running the callee directly. The callee
#     functions (`_do_it_session_state_set_locked` /
#     `_do_it_session_state_inc_locked`) write through a PID-scoped tmp file
#     and `mv -f`, which is atomic on POSIX, so concurrent writers no longer
#     stomp each other's tmp file. Last-writer-wins on the final mv, but no
#     more `state.json` evaporation.
#
# Args: <lock-path> <command...>
_do_it_with_state_lock() {
  local lock="$1"; shift
  if command -v flock >/dev/null 2>&1; then
    ( flock 9; "$@" ) 9>"$lock"
  else
    "$@"
  fi
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

# Internal: jq-backed set. Uses a PID-scoped tmp file so concurrent writers
# without flock do not clobber each other's tmp file. Caller already holds the
# lock when flock is available. Args: <state-path> <key> <value>.
_do_it_session_state_set_locked() {
  local state="$1" key="$2" value="$3"
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$state" ]]; then
    if ! jq -c --arg k "$key" --arg v "$value" '. + {($k): $v}' "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: jq update failed"
      return 1
    fi
    if ! mv -f "$tmp" "$state" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: atomic rename failed"
      return 1
    fi
  else
    if ! jq -nc --arg k "$key" --arg v "$value" '{($k): $v}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: jq init failed"
      return 1
    fi
    if ! mv -f "$tmp" "$state" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state set: atomic rename failed (init)"
      return 1
    fi
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

# Internal: jq-backed batched set. Args: <state-path> <k1> <v1> [<k2> <v2> ...].
# Single jq invocation + single atomic rename for N key/value pairs. Caller
# already holds the lock when flock is available.
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

# Batched write: one flock + one jq + one atomic rename for many keys.
# Args: <session_id> <k1> <v1> [<k2> <v2> ...].
do_it_session_state_set_many() {
  local session_id="$1"; shift
  if (( $# == 0 )) || (( $# % 2 != 0 )); then
    return 1
  fi
  local dir state
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 0
  state="$dir/state.json"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    _do_it_with_state_lock "$dir/.state.lock" \
      _do_it_session_state_set_many_locked "$state" "$@"
    return 0
  fi
  while (( $# >= 2 )); do
    printf '%s=%s\n' "$1" "$2" >> "$dir/state.kv"
    shift 2
  done
}

# Internal: jq-backed inc. PID-scoped tmp file + atomic mv (see set-locked).
# Caller already holds the lock when flock is available.
# Args: <state-path> <bucket> <counter-name>.
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
    if ! mv -f "$tmp" "$state" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state inc: atomic rename failed"
      return 1
    fi
  else
    if ! jq -nc --arg b "$bucket" --arg n "$name" '{($b): {($n): 1}}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state inc: jq init failed"
      return 1
    fi
    if ! mv -f "$tmp" "$state" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "session state inc: atomic rename failed (init)"
      return 1
    fi
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

# Internal: escape a string for embedding inside a JSON string literal. Used by
# the jq-free fallbacks of do_it_emit_context / do_it_emit_block so that a host
# without jq still receives valid JSON instead of an empty (dropped) decision.
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
do_it_emit_context() {
  local event="$1" text="$2"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg e "$event" --arg t "$text" \
      '{hookSpecificOutput: {hookEventName: $e, additionalContext: $t}}'
  else
    printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' \
      "$(_do_it_json_escape "$event")" "$(_do_it_json_escape "$text")"
  fi
}

# Emit Stop-hook block decision. Args: <reason>.
do_it_emit_block() {
  local reason="$1"
  if [[ "$DO_IT_HAVE_JQ" == "1" ]]; then
    jq -nc --arg r "$reason" '{decision: "block", reason: $r}'
  else
    printf '{"decision":"block","reason":"%s"}\n' "$(_do_it_json_escape "$reason")"
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
