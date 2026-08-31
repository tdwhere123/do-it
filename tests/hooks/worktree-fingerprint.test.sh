#!/usr/bin/env bash
# Public helpers in hooks/lib/worktree-fingerprint.sh.
# Usage: bash tests/hooks/worktree-fingerprint.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FP="$REPO_ROOT/hooks/lib/worktree-fingerprint.sh"

if [[ ! -f "$FP" ]]; then
  echo "FAIL: worktree-fingerprint.sh not found at $FP" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-fp.XXXXXX")"
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
  printf '%s' "$dir"
}

_fp_field() {
  printf '%s' "$1" | jq -r "$2"
}

echo "Case 1: clean worktree is complete and includes HEAD"
(
  source "$FP"
  repo="$(_setup_repo)"
  snap="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$snap" .coverage)" == "complete" ]] || exit 11
  head="$(git -C "$repo" rev-parse HEAD)"
  [[ "$(_fp_field "$snap" .head)" == "$head" ]] || exit 12
  [[ "$(_fp_field "$snap" .fingerprint)" != "null" ]] || exit 13
  [[ "$(_fp_field "$snap" .observed_epoch)" == "0" ]] || exit 14
)
case "$?" in
  0)  _pass "clean snapshot is complete with HEAD" ;;
  11) _fail "clean worktree was not complete" ;;
  12) _fail "HEAD did not match rev-parse" ;;
  13) _fail "fingerprint was null on a clean repo" ;;
  14) _fail "missing epoch was not 0" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 2: dirty tracked and untracked files change the fingerprint"
(
  source "$FP"
  repo="$(_setup_repo)"
  clean="$(do_it_worktree_fingerprint "$repo")"
  printf 'dirty\n' >> "$repo/README"
  dirty="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$clean" .fingerprint)" != "$(_fp_field "$dirty" .fingerprint)" ]] || exit 21
  git -C "$repo" checkout -- README
  again="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$clean" .fingerprint)" == "$(_fp_field "$again" .fingerprint)" ]] || exit 22
  printf 'extra\n' > "$repo/untracked.txt"
  untracked="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$clean" .fingerprint)" != "$(_fp_field "$untracked" .fingerprint)" ]] || exit 23
  printf 'staged\n' >> "$repo/README"
  git -C "$repo" add README
  staged="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$clean" .fingerprint)" != "$(_fp_field "$staged" .fingerprint)" ]] || exit 24
)
case "$?" in
  0)  _pass "dirty, untracked, and staged changes alter the fingerprint" ;;
  21) _fail "tracked dirty did not change fingerprint" ;;
  22) _fail "reverting dirty did not restore fingerprint" ;;
  23) _fail "untracked file did not change fingerprint" ;;
  24) _fail "staged change did not change fingerprint" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 3: over-budget untracked is partial, never complete"
(
  source "$FP"
  repo="$(_setup_repo)"
  printf 'a\n' > "$repo/u1.txt"
  printf 'b\n' > "$repo/u2.txt"
  export DO_IT_FP_MAX_UNTRACKED_FILES=1
  snap="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$snap" .coverage)" == "partial" ]] || exit 31
  [[ "$(_fp_field "$snap" .fingerprint)" != "null" ]] || exit 32
  unset DO_IT_FP_MAX_UNTRACKED_FILES
  export DO_IT_FP_MAX_UNTRACKED_BYTES=2
  snap2="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$snap2" .coverage)" == "partial" ]] || exit 33
)
case "$?" in
  0)  _pass "over-limit untracked is partial with a real digest" ;;
  31) _fail "file-count over-limit was not partial" ;;
  32) _fail "partial snapshot faked a null fingerprint" ;;
  33) _fail "byte-budget over-limit was not partial" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 4: non-git cwd is unavailable"
(
  source "$FP"
  nogit="$(mktemp -d "$TMP_ROOT/nogit.XXXXXX")"
  snap="$(do_it_worktree_fingerprint "$nogit")"
  [[ "$(_fp_field "$snap" .coverage)" == "unavailable" ]] || exit 41
  [[ "$(_fp_field "$snap" .head)" == "null" ]] || exit 42
  [[ "$(_fp_field "$snap" .fingerprint)" == "null" ]] || exit 43
)
case "$?" in
  0)  _pass "non-git fingerprint is unavailable" ;;
  41) _fail "non-git coverage was not unavailable" ;;
  42) _fail "non-git head was not null" ;;
  43) _fail "non-git fingerprint was not null" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 5: observed epoch bump/get; ledger writes do not fake completeness"
(
  source "$FP"
  repo="$(_setup_repo)"
  [[ "$(do_it_observed_epoch_get "$repo")" == "0" ]] || exit 51
  next="$(do_it_observed_epoch_bump "$repo")" || exit 52
  [[ "$next" == "1" ]] || exit 53
  [[ "$(do_it_observed_epoch_get "$repo")" == "1" ]] || exit 54
  snap="$(do_it_worktree_fingerprint "$repo")"
  [[ "$(_fp_field "$snap" .observed_epoch)" == "1" ]] || exit 55
  [[ "$(_fp_field "$snap" .coverage)" == "complete" ]] || exit 56
)
case "$?" in
  0)  _pass "epoch bump is recorded without changing coverage" ;;
  51) _fail "initial epoch was not 0" ;;
  52) _fail "epoch bump failed" ;;
  53) _fail "epoch bump did not return 1" ;;
  54) _fail "epoch get did not see the bump" ;;
  55) _fail "fingerprint did not include the bumped epoch" ;;
  56) _fail "epoch file made coverage incomplete" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 6: unwritable runtime bump fail-open"
(
  source "$FP"
  repo="$(_setup_repo)"
  mkdir -p "$repo/.do-it/runtime"
  chmod 500 "$repo/.do-it/runtime"
  val="$(do_it_observed_epoch_bump "$repo")" || true
  [[ "$val" == "0" ]] || exit 61
  [[ "$(do_it_observed_epoch_get "$repo")" == "0" ]] || exit 62
)
case "$?" in
  0)  _pass "unwritable epoch bump fail-open" ;;
  61) _fail "unwritable bump did not print 0" ;;
  62) _fail "unwritable bump mutated epoch" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
