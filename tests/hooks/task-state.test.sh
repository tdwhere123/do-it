#!/usr/bin/env bash
# Public helpers in hooks/lib/task-state.sh and adaptive-profile.sh.
# Usage: bash tests/hooks/task-state.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TASK_STATE="$REPO_ROOT/hooks/lib/task-state.sh"
ADAPTIVE="$REPO_ROOT/hooks/lib/adaptive-profile.sh"

if [[ ! -f "$TASK_STATE" ]]; then
  echo "FAIL: task-state.sh not found at $TASK_STATE" >&2
  exit 1
fi
if [[ ! -f "$ADAPTIVE" ]]; then
  echo "FAIL: adaptive-profile.sh not found at $ADAPTIVE" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-task-state.XXXXXX")"
export HOME="$TMP_ROOT/home"
mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE

cleanup() { chmod -R u+w "$TMP_ROOT" 2>/dev/null || true; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_setup_repo() {
  local dir
  dir="$(mktemp -d "$TMP_ROOT/repo.XXXXXX")"
  git -C "$dir" init -q
  git -C "$dir" config user.email t@e.com
  git -C "$dir" config user.name t
  printf 'base\n' > "$dir/README"
  git -C "$dir" add README
  git -C "$dir" commit -q -m base
  mkdir -p "$dir/.do-it/plans"
  printf '# plan\n' > "$dir/.do-it/plans/sample.md"
  printf '%s' "$dir"
}

echo "Case 1: write/read/clear a valid active-task pointer"
(
  source "$TASK_STATE"
  repo="$(_setup_repo)"
  do_it_active_task_write ".do-it/plans/sample.md" "$repo" || exit 11
  got="$(do_it_active_task_read "$repo")"
  [[ "$got" == ".do-it/plans/sample.md" ]] || exit 12
  pointer="$(do_it_runtime_root "$repo")/active-task"
  [[ -f "$pointer" ]] || exit 13
  mode="$(stat -c %a "$pointer" 2>/dev/null || stat -f %OLp "$pointer")"
  [[ "$mode" == "600" ]] || exit 14
  do_it_active_task_clear "$repo" || exit 15
  got="$(do_it_active_task_read "$repo")"
  [[ -z "$got" ]] || exit 16
)
case "$?" in
  0)  _pass "valid pointer round-trips and clears" ;;
  11) _fail "write rejected a valid path" ;;
  12) _fail "read did not return the stored path" ;;
  13) _fail "active-task file was not created" ;;
  14) _fail "active-task mode was not 600" ;;
  15) _fail "clear failed" ;;
  16) _fail "clear left a readable pointer" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 2: reject traversal, absolute, and nested paths"
(
  source "$TASK_STATE"
  repo="$(_setup_repo)"
  do_it_active_task_write "../escape.md" "$repo" && exit 21
  do_it_active_task_write "/etc/passwd" "$repo" && exit 22
  do_it_active_task_write ".do-it/plans/../../etc/passwd" "$repo" && exit 23
  do_it_active_task_write ".do-it/plans/nested/dir.md" "$repo" && exit 24
  do_it_active_task_write $'.do-it/plans/evil\n.md' "$repo" && exit 25
  [[ ! -f "$repo/.do-it/runtime/active-task" ]] || exit 26
  [[ ! -e "$TMP_ROOT/escape.md" ]] || exit 27
)
case "$?" in
  0)  _pass "malicious task paths are rejected" ;;
  21) _fail "../escape.md was accepted" ;;
  22) _fail "absolute path was accepted" ;;
  23) _fail "plans/../ traversal was accepted" ;;
  24) _fail "nested plans path was accepted" ;;
  25) _fail "newline in path was accepted" ;;
  26) _fail "rejected write still created active-task" ;;
  27) _fail "traversal escaped the repo" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 3: reject symlink escape; accept in-bounds symlink"
(
  source "$TASK_STATE"
  repo="$(_setup_repo)"
  ln -s /etc/passwd "$repo/.do-it/plans/evil.md"
  do_it_active_task_write ".do-it/plans/evil.md" "$repo" && exit 31
  ln -s sample.md "$repo/.do-it/plans/link.md"
  do_it_active_task_write ".do-it/plans/link.md" "$repo" || exit 32
  got="$(do_it_active_task_read "$repo")"
  [[ "$got" == ".do-it/plans/link.md" ]] || exit 33
)
case "$?" in
  0)  _pass "symlink escape rejected; in-bounds symlink accepted" ;;
  31) _fail "symlink to /etc/passwd was accepted" ;;
  32) _fail "in-bounds symlink was rejected" ;;
  33) _fail "in-bounds symlink was not stored" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 4: tampered pointer and missing runtime fail-open"
(
  source "$TASK_STATE"
  repo="$(_setup_repo)"
  missing="$(do_it_active_task_read "$repo")"
  [[ -z "$missing" ]] || exit 41
  mkdir -p "$repo/.do-it/runtime"
  printf '%s\n' '../../../etc/passwd' > "$repo/.do-it/runtime/active-task"
  got="$(do_it_active_task_read "$repo")"
  [[ -z "$got" ]] || exit 42
  do_it_active_task_clear "$repo"
  nogit="$(mktemp -d "$TMP_ROOT/nogit.XXXXXX")"
  empty="$(do_it_active_task_read "$nogit")"
  [[ -z "$empty" ]] || exit 43
)
case "$?" in
  0)  _pass "missing and tampered pointers fail-open to empty" ;;
  41) _fail "missing pointer was not empty" ;;
  42) _fail "tampered pointer was returned" ;;
  43) _fail "non-git cwd did not fail-open" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 5: unwritable runtime does not crash; runtime symlink cannot escape"
(
  source "$TASK_STATE"
  repo="$(_setup_repo)"
  mkdir -p "$repo/.do-it"
  outside="$TMP_ROOT/outside-runtime"
  mkdir -p "$outside"
  ln -s "$outside" "$repo/.do-it/runtime"
  do_it_active_task_write ".do-it/plans/sample.md" "$repo" && exit 51
  [[ ! -f "$outside/active-task" ]] || exit 52
  rm -f "$repo/.do-it/runtime"
  mkdir -p "$repo/.do-it/runtime"
  chmod 500 "$repo/.do-it/runtime"
  do_it_active_task_write ".do-it/plans/sample.md" "$repo" && exit 53
  [[ ! -f "$repo/.do-it/runtime/active-task" ]] || exit 54
)
case "$?" in
  0)  _pass "unwritable/escaped runtime fails open without writing outside" ;;
  51) _fail "runtime symlink escape was accepted" ;;
  52) _fail "active-task escaped through runtime symlink" ;;
  53) _fail "unwritable runtime write returned success" ;;
  54) _fail "unwritable runtime still created active-task" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 6: adaptive profile resolve/hash/parse, project over global"
(
  source "$TASK_STATE"
  source "$ADAPTIVE"
  repo="$(_setup_repo)"
  mkdir -p "$HOME/.do-it/adaptive"
  cat > "$HOME/.do-it/adaptive/profile.md" <<'MD'
---
schema: do-it/adaptive-profile/v1
---

## Active
- P001 [all] Global delta only.
MD
  none="$(do_it_adaptive_profile_resolve "$repo")"
  [[ "$none" == "$HOME/.do-it/adaptive/profile.md" ]] || exit 61
  parsed="$(do_it_adaptive_profile_parse "" "$repo")"
  [[ "$parsed" == $'P001\tall\tGlobal delta only.' ]] || exit 62
  h1="$(do_it_adaptive_profile_hash "$repo")"
  [[ -n "$h1" ]] || exit 63
  mkdir -p "$repo/.do-it/runtime/adaptive"
  cat > "$repo/.do-it/runtime/adaptive/profile.md" <<'MD'
---
schema: do-it/adaptive-profile/v1
---

## Active
- P002 [review] Project delta wins.
MD
  resolved="$(do_it_adaptive_profile_resolve "$repo")"
  [[ "$resolved" == "$repo/.do-it/runtime/adaptive/profile.md" ]] || exit 64
  parsed="$(do_it_adaptive_profile_parse "" "$repo")"
  [[ "$parsed" == $'P002\treview\tProject delta wins.' ]] || exit 65
  h2="$(do_it_adaptive_profile_hash "$repo")"
  [[ "$h1" != "$h2" ]] || exit 66
  mkdir -p "$TMP_ROOT/escape-profile"
  printf 'nope\n' > "$TMP_ROOT/escape-profile/profile.md"
  ln -sf "$TMP_ROOT/escape-profile/profile.md" "$repo/.do-it/runtime/adaptive/profile.md"
  resolved="$(do_it_adaptive_profile_resolve "$repo")"
  [[ "$resolved" == "$HOME/.do-it/adaptive/profile.md" ]] || exit 67
)
case "$?" in
  0)  _pass "profile resolve prefers project, hashes, parses Active, skips escape" ;;
  61) _fail "global profile was not resolved" ;;
  62) _fail "global Active bullets did not parse" ;;
  63) _fail "global profile hash was empty" ;;
  64) _fail "project profile did not win" ;;
  65) _fail "project Active bullets did not parse" ;;
  66) _fail "project hash did not change" ;;
  67) _fail "escaping project symlink was not skipped" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 7: missing profile and missing git fail-open"
(
  source "$TASK_STATE"
  source "$ADAPTIVE"
  export HOME="$TMP_ROOT/empty-home"
  mkdir -p "$HOME"
  repo="$(_setup_repo)"
  [[ -z "$(do_it_adaptive_profile_resolve "$repo")" ]] || exit 71
  [[ -z "$(do_it_adaptive_profile_hash "$repo")" ]] || exit 72
  [[ -z "$(do_it_adaptive_profile_parse "" "$repo")" ]] || exit 73
  nogit="$(mktemp -d "$TMP_ROOT/nogit.XXXXXX")"
  [[ -z "$(do_it_adaptive_profile_resolve "$nogit")" ]] || exit 74
)
case "$?" in
  0)  _pass "missing profile/git fail-open to empty" ;;
  71) _fail "missing project/global still resolved a path" ;;
  72) _fail "missing profile produced a hash" ;;
  73) _fail "missing profile produced parse output" ;;
  74) _fail "non-git cwd resolved a project profile" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
