#!/usr/bin/env bash
# Worktree freshness snapshot: HEAD + tracked/staged digest + bounded untracked
# digest. Over-budget scans are `partial` and never reported as complete.
# Source from hook libraries; a missing git/hash tool is unavailable, not a crash.

set -uo pipefail

_DO_IT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -F do_it_runtime_root >/dev/null 2>&1; then
  # shellcheck source=task-state.sh
  source "${_DO_IT_LIB_DIR}/task-state.sh"
fi

_do_it_fp_unavailable() {
  printf '%s\n' '{"head":null,"fingerprint":null,"coverage":"unavailable","observed_epoch":null}'
}

_do_it_fp_file_size() {
  local f="$1"
  if stat -c %s "$f" >/dev/null 2>&1; then
    stat -c %s "$f" 2>/dev/null
  elif stat -f %z "$f" >/dev/null 2>&1; then
    stat -f %z "$f" 2>/dev/null
  else
    wc -c < "$f" 2>/dev/null | tr -d ' '
  fi
}

_do_it_fp_hash_prefix() {
  local file="$1" max="$2" tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/doit-fp.XXXXXX")" || return 1
  set +o pipefail
  head -c "$max" "$file" > "$tmp" 2>/dev/null || true
  set -o pipefail
  _do_it_sha256_hex < "$tmp"
  rm -f "$tmp" 2>/dev/null || true
}

_do_it_fp_hash_git_diff() {
  local root="$1" max="$2"
  shift 2
  local tmp size
  tmp="$(mktemp "${TMPDIR:-/tmp}/doit-fp.XXXXXX")" || return 1
  set +o pipefail
  git -C "$root" diff --binary "$@" 2>/dev/null | head -c $((max + 1)) > "$tmp" || true
  set -o pipefail
  size="$(_do_it_fp_file_size "$tmp")"
  size="${size:-0}"
  if [[ "$size" -gt "$max" ]]; then
    set +o pipefail
    head -c "$max" "$tmp" 2>/dev/null | _do_it_sha256_hex
    set -o pipefail
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  _do_it_sha256_hex < "$tmp"
  rm -f "$tmp" 2>/dev/null || true
  return 0
}

do_it_observed_epoch_get() {
  local cwd="${1:-.}" runtime f v
  runtime="$(do_it_runtime_root "$cwd")"
  [[ -n "$runtime" ]] || { printf '0'; return 0; }
  f="${runtime}/observed-epoch"
  [[ -f "$f" && -r "$f" ]] || { printf '0'; return 0; }
  v="$(tr -d '[:space:]' < "$f" 2>/dev/null || true)"
  case "$v" in
    ''|*[!0-9]*) printf '0' ;;
    *) printf '%s' "$v" ;;
  esac
}

_do_it_observed_epoch_bump_locked() {
  local f="$1" prev=0 next tmp
  if [[ -f "$f" ]]; then
    prev="$(tr -d '[:space:]' < "$f" 2>/dev/null || true)"
    case "$prev" in
      ''|*[!0-9]*) prev=0 ;;
    esac
  fi
  next=$((prev + 1))
  tmp="${f}.${BASHPID:-$$}.${RANDOM}.tmp"
  if ! printf '%s\n' "$next" > "$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  if ! mv -f "$tmp" "$f" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    return 1
  fi
  chmod 600 "$f" 2>/dev/null || true
  printf '%s' "$next"
}

do_it_observed_epoch_bump() {
  local cwd="${1:-.}" runtime out
  runtime="$(do_it_runtime_root "$cwd")"
  if [[ -z "$runtime" ]] || ! _do_it_runtime_prepare "$cwd"; then
    printf '0'
    return 1
  fi
  out="$(_do_it_with_state_lock "${runtime}/.epoch.lock" \
    _do_it_observed_epoch_bump_locked "${runtime}/observed-epoch")" || {
    printf '0'
    return 1
  }
  printf '%s' "${out:-0}"
}

# One JSON object: head, fingerprint, coverage, observed_epoch. Always exit 0.
do_it_worktree_fingerprint() {
  local cwd="${1:-.}"
  local max_files="${DO_IT_FP_MAX_UNTRACKED_FILES:-64}"
  local max_file_bytes="${DO_IT_FP_MAX_FILE_BYTES:-65536}"
  local max_untracked_bytes="${DO_IT_FP_MAX_UNTRACKED_BYTES:-262144}"
  local max_diff_bytes="${DO_IT_FP_MAX_DIFF_BYTES:-1048576}"

  if ! command -v git >/dev/null 2>&1; then
    _do_it_fp_unavailable
    return 0
  fi
  local inside
  inside="$(git -C "$cwd" rev-parse --is-inside-work-tree 2>/dev/null || true)"
  if [[ "$inside" != "true" ]]; then
    _do_it_fp_unavailable
    return 0
  fi
  local root
  root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -z "$root" ]]; then
    _do_it_fp_unavailable
    return 0
  fi

  local partial=0 head="" tracked="" staged="" untracked="" fp=""
  head="$(git -C "$root" rev-parse HEAD 2>/dev/null || true)"
  if [[ -z "$head" ]]; then
    partial=1
    head=""
  fi

  tracked="$(_do_it_fp_hash_git_diff "$root" "$max_diff_bytes" HEAD)" || partial=1
  staged="$(_do_it_fp_hash_git_diff "$root" "$max_diff_bytes" --cached)" || partial=1
  if [[ -z "$tracked" || -z "$staged" ]]; then
    _do_it_fp_unavailable
    return 0
  fi

  local tmp_list rel f h size used=0 count=0 canon=""
  tmp_list="$(mktemp "${TMPDIR:-/tmp}/doit-fp-list.XXXXXX")" || {
    _do_it_fp_unavailable
    return 0
  }
  git -C "$root" ls-files -z --others --exclude-standard > "$tmp_list" 2>/dev/null || true
  while IFS= read -r -d '' rel; do
    [[ -n "$rel" ]] || continue
    case "$rel" in
      .do-it/runtime|.do-it/runtime/*) continue ;;
    esac
    count=$((count + 1))
    if [[ "$count" -gt "$max_files" ]]; then
      partial=1
      break
    fi
    f="${root}/${rel}"
    if [[ -L "$f" ]]; then
      h="$(printf 'symlink:%s' "$(readlink "$f" 2>/dev/null || true)" | _do_it_sha256_hex)"
      canon="${canon}${rel} ${h}"$'\n'
      continue
    fi
    [[ -f "$f" ]] || continue
    size="$(_do_it_fp_file_size "$f")"
    size="${size:-0}"
    if [[ "$size" -gt "$max_file_bytes" ]]; then
      partial=1
      h="$(_do_it_fp_hash_prefix "$f" "$max_file_bytes")"
      used=$((used + max_file_bytes))
    elif [[ $((used + size)) -gt "$max_untracked_bytes" ]]; then
      partial=1
      break
    else
      h="$(_do_it_sha256_hex < "$f")"
      used=$((used + size))
    fi
    [[ -n "$h" ]] || partial=1
    canon="${canon}${rel} ${h}"$'\n'
  done < "$tmp_list"
  rm -f "$tmp_list" 2>/dev/null || true

  untracked="$(printf '%s' "$canon" | _do_it_sha256_hex)"
  [[ -n "$untracked" ]] || {
    _do_it_fp_unavailable
    return 0
  }

  fp="$(printf 'head:%s\ntracked:%s\nstaged:%s\nuntracked:%s\n' \
    "$head" "$tracked" "$staged" "$untracked" | _do_it_sha256_hex)"
  if [[ -z "$fp" ]]; then
    _do_it_fp_unavailable
    return 0
  fi

  local coverage="complete" epoch epoch_json head_json
  [[ "$partial" -eq 0 ]] || coverage="partial"
  epoch="$(do_it_observed_epoch_get "$cwd")"
  case "$epoch" in
    ''|*[!0-9]*) epoch_json="null" ;;
    *) epoch_json="$epoch" ;;
  esac
  if [[ -n "$head" ]]; then
    head_json="\"$(_do_it_json_escape "$head")\""
  else
    head_json="null"
  fi
  printf '{"head":%s,"fingerprint":"%s","coverage":"%s","observed_epoch":%s}\n' \
    "$head_json" "$(_do_it_json_escape "$fp")" "$coverage" "$epoch_json"
  return 0
}
