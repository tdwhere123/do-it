#!/usr/bin/env bash
# Filesystem helpers for opt-in runtime diagnostics. Source from hook libraries:
#   source "${SCRIPT_DIR}/lib/task-state.sh"
#
# Missing or unwritable runtime never crashes the caller.

set -uo pipefail

_DO_IT_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! declare -F do_it_session_dir >/dev/null 2>&1; then
  # shellcheck source=common.sh
  source "${_DO_IT_LIB_DIR}/common.sh"
fi

# SHA-256 hex digest of stdin. Empty when no hash tool is available.
_do_it_sha256_hex() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum 2>/dev/null | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 2>/dev/null | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 2>/dev/null | awk '{print $NF}'
  elif command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const crypto = require("crypto");
      const hash = crypto.createHash("sha256");
      fs.readFile(0, (err, buf) => {
        if (!err && buf) hash.update(buf);
        process.stdout.write(hash.digest("hex"));
      });
    ' 2>/dev/null
  else
    printf ''
  fi
}

# Physical path of $1. Empty on failure.
_do_it_realpath() {
  local p="${1:-}"
  [[ -n "$p" ]] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$p" 2>/dev/null && return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs"); process.stdout.write(fs.realpathSync(process.argv[1]));' "$p" 2>/dev/null && return 0
  fi
  if command -v realpath >/dev/null 2>&1; then
    realpath "$p" 2>/dev/null && return 0
  fi
  if readlink -f "$p" >/dev/null 2>&1; then
    readlink -f "$p" 2>/dev/null && return 0
  fi
  return 1
}

# True when $1 is $2 or a descendant. Both arguments must already be resolved.
_do_it_path_is_under() {
  local inner="${1:-}" outer="${2:-}"
  [[ -n "$inner" && -n "$outer" ]] || return 1
  case "$inner" in
    "$outer"|"$outer"/*) return 0 ;;
  esac
  return 1
}

_do_it_trim() {
  local s="${1:-}"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  s="${s%$'\r'}"
  printf '%s' "$s"
}

# Git toplevel for cwd, or empty when cwd is not inside a worktree.
do_it_git_root() {
  local cwd="${1:-.}"
  [[ -d "$cwd" ]] || return 0
  git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true
}

# `<git-root>/.do-it/runtime`, or empty outside a worktree.
do_it_runtime_root() {
  local root
  root="$(do_it_git_root "${1:-.}")"
  [[ -n "$root" ]] || return 0
  printf '%s/.do-it/runtime' "$root"
}

# True when existing .do-it / runtime paths do not escape the repo.
_do_it_runtime_is_safe() {
  local root="${1:-}" real_root real_path p
  [[ -n "$root" && -d "$root" ]] || return 1
  real_root="$(_do_it_realpath "$root")" || return 1
  for p in "${root}/.do-it" "${root}/.do-it/runtime" "${root}/.do-it/runtime/events"; do
    if [[ -L "$p" || -e "$p" ]]; then
      real_path="$(_do_it_realpath "$p")" || return 1
      _do_it_path_is_under "$real_path" "$real_root" || return 1
    fi
  done
  return 0
}

# Create runtime dirs (mode 0700) and the self-contained gitignore. Fail closed
# on symlink escape; callers of public write helpers still fail-open.
_do_it_runtime_prepare() {
  local cwd="${1:-.}" root runtime real_root real_rt old_umask
  root="$(do_it_git_root "$cwd")"
  [[ -n "$root" ]] || return 1
  _do_it_runtime_is_safe "$root" || return 1
  runtime="${root}/.do-it/runtime"
  old_umask="$(umask)"
  umask 077
  if ! mkdir -p "${runtime}/events" 2>/dev/null; then
    umask "$old_umask"
    return 1
  fi
  umask "$old_umask"
  [[ -w "$runtime" && -w "${runtime}/events" ]] || return 1
  real_root="$(_do_it_realpath "$root")" || return 1
  real_rt="$(_do_it_realpath "$runtime")" || return 1
  _do_it_path_is_under "$real_rt" "$real_root" || return 1
  _do_it_ensure_runtime_gitignore "$runtime"
  return 0
}

_do_it_runtime_warn() {
  [[ -n "${_DO_IT_RUNTIME_WARNED:-}" ]] && return 0
  _DO_IT_RUNTIME_WARNED=1
  printf 'do-it: %s\n' "${1:-runtime write failed}" >&2
}
