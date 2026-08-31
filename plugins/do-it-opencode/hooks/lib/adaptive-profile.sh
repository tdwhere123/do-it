#!/usr/bin/env bash
# Adaptive profile resolve / hash / parse. Source from hook libraries.
# Does not inject profile text. Project file wins over ~/.do-it/adaptive.

set -uo pipefail

_DO_IT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -F do_it_runtime_root >/dev/null 2>&1; then
  # shellcheck source=task-state.sh
  source "${_DO_IT_LIB_DIR}/task-state.sh"
fi

do_it_adaptive_profile_global_path() {
  printf '%s/.do-it/adaptive/profile.md' "${HOME:-}"
}

do_it_adaptive_profile_project_path() {
  local runtime
  runtime="$(do_it_runtime_root "${1:-.}")"
  [[ -n "$runtime" ]] || return 0
  printf '%s/adaptive/profile.md' "$runtime"
}

# Winning profile path: project file if present and inside the repo, else global.
# Empty when neither exists. Always exit 0.
do_it_adaptive_profile_resolve() {
  local cwd="${1:-.}" root project global real_root real_file
  root="$(do_it_git_root "$cwd")"
  if [[ -n "$root" ]]; then
    project="${root}/.do-it/runtime/adaptive/profile.md"
    if [[ -f "$project" ]]; then
      real_root="$(_do_it_realpath "$root")" || real_root=""
      real_file="$(_do_it_realpath "$project")" || real_file=""
      if [[ -n "$real_root" && -n "$real_file" ]] && _do_it_path_is_under "$real_file" "$real_root"; then
        printf '%s' "$project"
        return 0
      fi
      if [[ ! -L "$project" ]]; then
        printf '%s' "$project"
        return 0
      fi
    fi
  fi
  global="$(do_it_adaptive_profile_global_path)"
  if [[ -n "${HOME:-}" && -f "$global" ]]; then
    printf '%s' "$global"
  fi
  return 0
}

# SHA-256 of the resolved profile bytes, or empty when missing.
do_it_adaptive_profile_hash() {
  local cwd="${1:-.}" path
  path="$(do_it_adaptive_profile_resolve "$cwd")"
  [[ -n "$path" && -f "$path" && -r "$path" ]] || { printf ''; return 0; }
  _do_it_sha256_hex < "$path" 2>/dev/null || true
  return 0
}

# Print Active bullets as `id<TAB>scope<TAB>statement`. Args: [path] [cwd].
do_it_adaptive_profile_parse() {
  local path="${1:-}" cwd="${2:-.}"
  if [[ -z "$path" ]]; then
    path="$(do_it_adaptive_profile_resolve "$cwd")"
  fi
  [[ -n "$path" && -f "$path" && -r "$path" ]] || return 0
  awk '
    /^##[[:space:]]+[Aa]ctive[[:space:]]*$/ { in_active=1; next }
    /^##[[:space:]]/ { in_active=0; next }
    in_active && $0 ~ /^-[[:space:]]*P[0-9]+[[:space:]]+\[[^]]+\][[:space:]]+/ {
      line=$0
      sub(/^-[[:space:]]*/, "", line)
      id=line
      sub(/[[:space:]].*/, "", id)
      rest=line
      sub(/^P[0-9]+[[:space:]]+\[/, "", rest)
      scope=rest
      sub(/\].*/, "", scope)
      stmt=line
      sub(/^P[0-9]+[[:space:]]+\[[^]]+\][[:space:]]*/, "", stmt)
      printf "%s\t%s\t%s\n", id, scope, stmt
    }
  ' "$path" 2>/dev/null || true
  return 0
}
