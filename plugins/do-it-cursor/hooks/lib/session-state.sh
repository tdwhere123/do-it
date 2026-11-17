#!/usr/bin/env bash
# do-it hook session state and locking helpers (sourced by hooks/lib/common.sh).
# Uses flock when available and falls back to an atomic mkdir lock; without jq
# it degrades to an append-and-snapshot state.kv file.

# Age (in days) past which an inactive session directory is pruned by
# do_it_prune_stale_sessions.
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

  # `-mtime +N` / `-mtime -N` are portable across BSD and GNU find. The inner
  # scan confirms candidates because jq-less `state.kv` appends bump file mtime.
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

_do_it_release_mkdir_lock() {
  local lock_dir="$1" token="$2" current=""
  current="$(cat "$lock_dir/owner" 2>/dev/null)"
  [[ -n "$token" && "$current" == "$token" ]] || return 1
  rm -f "$lock_dir/owner" 2>/dev/null || return 1
  # A waiter may reclaim a stale-looking dir between rm and rmdir; once owner is
  # removed, missing dir still represents a completed release.
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
      if [[ "$_lock_delay" != "spin" ]]; then
        sleep "$_lock_delay"
      fi
      continue
    fi

    if mkdir "$lock_dir" 2>/dev/null; then
      # Prefer BASHPID (live subshell pid) or $$ (bash 3.2 lacks BASHPID);
      # never use a transient command-substitution pid that dies immediately.
      owner_pid="${BASHPID:-$$}"
      [[ "$owner_pid" =~ ^[0-9]+$ ]] || owner_pid="$$"
      token="${owner_pid}:${RANDOM}:${RANDOM}"
      if ! printf '%s\n' "$token" > "$lock_dir/owner" 2>/dev/null; then
        if [[ -d "$lock_dir" && ! -e "$lock_dir/owner" ]]; then
          rmdir "$lock_dir" 2>/dev/null || true
          return 1
        fi
        attempts=$((attempts + 1))
        if [[ "$_lock_delay" != "spin" ]]; then
          sleep "$_lock_delay"
        fi
        continue
      fi
      acquired=1
      break
    fi

    attempts=$((attempts + 1))
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
          local final_record
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
    if [[ "$_lock_delay" != "spin" ]]; then
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

_do_it_warn_state_corruption() {
  local state="$1" msg="$2"
  local dir marker
  dir="$(dirname "$state")"
  marker="${dir}/.state-warn"
  if [[ ! -f "$marker" ]]; then
    : > "$marker" 2>/dev/null || true
    printf 'do-it: %s (state=%s)\n' "$msg" "$state" >&2
  fi
}

# Read a value from session state JSON (or state.kv fallback). Args: <session_id> <key>.
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

# Write a value to session state. Args: <session_id> <key> <value>.
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

# Batched atomic write. Args: <session_id> <k1> <v1> [<k2> <v2> ...].
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

_do_it_session_state_bump_kv_locked() {
  local kv="$1" key="$2" prev
  prev="$(grep -E "^${key}=" "$kv" 2>/dev/null | tail -n1 | cut -d= -f2-)"
  case "$prev" in
    ''|*[!0-9]*) prev=0 ;;
  esac
  _do_it_session_state_append_kv_locked "$kv" "$key" "$((prev + 1))"
}

# Atomically increment one top-level numeric key. Args: <session_id> <key>.
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

# Increment a nested counter key. Args: <session_id> <bucket-key> <counter-name>.
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

_do_it_user_turn_bump_locked() {
  local state="$1"
  local tmp="${state}.${BASHPID:-$$}.$RANDOM.tmp"
  if [[ -f "$state" ]]; then
    if ! jq -c '
      .user_turn = ((.user_turn // 0) | tonumber + 1)
      | with_entries(select((.key | startswith("wql_seen_")) | not))
      | ([to_entries[] | select(.key | startswith("wql_hash_"))]) as $hashes
      | if ($hashes | length) > 64 then
          with_entries(select((.key | startswith("wql_hash_")) | not)) + ($hashes[-64:] | from_entries)
        else . end
    ' "$state" > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "user turn bump: jq update failed"
      return 1
    fi
  else
    if ! jq -nc '{user_turn: 1}' > "$tmp" 2>/dev/null; then
      rm -f "$tmp" 2>/dev/null || true
      _do_it_warn_state_corruption "$state" "user turn bump: jq init failed"
      return 1
    fi
  fi
  if ! mv -f "$tmp" "$state" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    _do_it_warn_state_corruption "$state" "user turn bump: atomic rename failed"
    return 1
  fi
}

# Bump per-session user-turn counter and evict expired per-turn lint dedup keys.
do_it_user_turn_bump() {
  local session_id="$1" dir state
  if [[ "$DO_IT_HAVE_JQ" != "1" ]]; then
    do_it_session_state_bump "$session_id" user_turn
    return $?
  fi
  dir="$(do_it_session_dir "$session_id")"
  mkdir -p "$dir" 2>/dev/null || return 1
  state="$dir/state.json"
  _do_it_with_state_lock "$dir/.state.lock" _do_it_user_turn_bump_locked "$state"
}

do_it_user_turn_get() {
  local session_id="$1" turn
  turn="$(do_it_session_state_get "$session_id" user_turn)"
  case "$turn" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$turn" ;;
  esac
}

# Pretty-print session state as JSON. Args: <session_id>.
do_it_session_summary() {
  local session_id="$1" dir state
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
