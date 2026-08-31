#!/usr/bin/env bash
# Public helpers in hooks/lib/runtime-events.sh.
# Usage: bash tests/hooks/runtime-events.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVENTS="$REPO_ROOT/hooks/lib/runtime-events.sh"

if [[ ! -f "$EVENTS" ]]; then
  echo "FAIL: runtime-events.sh not found at $EVENTS" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-events.XXXXXX")"
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

echo "Case 1: append writes a schema-1 candidate with worktree and umask 077"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  do_it_observed_epoch_bump "$repo" >/dev/null
  DO_IT_EVENT_HOST=codex do_it_runtime_event_append edit observed "touched README" "$repo"
  log="$(do_it_evidence_log_path "$repo")"
  [[ -f "$log" ]] || exit 11
  mode="$(stat -c %a "$log" 2>/dev/null || stat -f %OLp "$log")"
  [[ "$mode" == "600" ]] || exit 12
  line="$(head -n1 "$log")"
  jq -e . >/dev/null <<<"$line" || exit 13
  [[ "$(jq -r .schema <<<"$line")" == "1" ]] || exit 14
  [[ "$(jq -r .kind <<<"$line")" == "edit" ]] || exit 15
  [[ "$(jq -r .source <<<"$line")" == "observed" ]] || exit 16
  [[ "$(jq -r .host <<<"$line")" == "codex" ]] || exit 17
  [[ "$(jq -r .summary <<<"$line")" == "touched README" ]] || exit 18
  [[ "$(jq -r .worktree.coverage <<<"$line")" == "complete" ]] || exit 19
  [[ "$(jq -r .worktree.observed_epoch <<<"$line")" == "1" ]] || exit 20
  jq -e 'has("proof") or has("verified") or has("VERIFIED")' <<<"$line" >/dev/null && exit 10
  [[ "$(jq -r '.worktree | has("head") and has("fingerprint") and has("coverage")' <<<"$line")" == "true" ]] || exit 9
)
case "$?" in
  0)  _pass "append writes schema-1 observed candidate, not proof" ;;
  9)  _fail "worktree object missing required fields" ;;
  10) _fail "observed event claimed proof" ;;
  11) _fail "evidence.jsonl was not created" ;;
  12) _fail "evidence.jsonl mode was not 600" ;;
  13) _fail "appended line was not JSON" ;;
  14) _fail "schema was not 1" ;;
  15) _fail "kind was not edit" ;;
  16) _fail "source was not observed" ;;
  17) _fail "host was not codex" ;;
  18) _fail "summary mismatch" ;;
  19) _fail "worktree coverage was not complete" ;;
  20) _fail "observed_epoch was not recorded" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 2: concurrent append does not corrupt JSONL"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  n=24
  for i in $(seq 1 "$n"); do
    ( DO_IT_EVENT_HOST=test do_it_runtime_event_append command observed "c$i" "$repo" ) &
  done
  wait
  log="$(do_it_evidence_log_path "$repo")"
  [[ -f "$log" ]] || exit 21
  lines="$(grep -c . "$log" | tr -d ' ')"
  [[ "$lines" -eq "$n" ]] || exit 22
  while IFS= read -r line; do
    jq -e . >/dev/null <<<"$line" || exit 23
    [[ "$(jq -r .schema <<<"$line")" == "1" ]] || exit 23
  done < "$log"
  ids="$(jq -r .event_id "$log" | sort -u | grep -c . | tr -d ' ')"
  [[ "$ids" -eq "$n" ]] || exit 24
)
case "$?" in
  0)  _pass "concurrent append kept one valid JSON object per line" ;;
  21) _fail "evidence log missing after race" ;;
  22) _fail "concurrent append lost or duplicated lines" ;;
  23) _fail "concurrent append produced malformed JSONL" ;;
  24) _fail "event_id values were not unique" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 3: invalid source/kind are ignored; reported stays reported"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  do_it_runtime_event_append edit proof "nope" "$repo" 2>/dev/null
  do_it_runtime_event_append not-a-kind observed "nope" "$repo" 2>/dev/null
  log="$(do_it_evidence_log_path "$repo")"
  if [[ -f "$log" ]]; then
    [[ "$(grep -c . "$log" | tr -d ' ')" == "0" ]] || exit 31
  fi
  DO_IT_EVENT_HOST=eval-harness do_it_runtime_event_append completion-claim reported "model summary" "$repo"
  line="$(head -n1 "$(do_it_evidence_log_path "$repo")")"
  [[ "$(jq -r .source <<<"$line")" == "reported" ]] || exit 32
  [[ "$(jq -r .kind <<<"$line")" == "completion-claim" ]] || exit 33
)
case "$?" in
  0)  _pass "invalid events ignored; reported is not rewritten as observed" ;;
  31) _fail "invalid source/kind wrote a ledger row" ;;
  32) _fail "reported source was rewritten" ;;
  33) _fail "completion-claim kind mismatch" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 4: unwritable runtime append still exits 0"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  mkdir -p "$repo/.do-it/runtime/events"
  chmod 500 "$repo/.do-it/runtime" "$repo/.do-it/runtime/events"
  do_it_runtime_event_append edit observed "cannot write" "$repo" 2>/dev/null
  st=$?
  [[ "$st" -eq 0 ]] || exit 41
  [[ ! -s "$repo/.do-it/runtime/events/evidence.jsonl" ]] || exit 42
)
case "$?" in
  0)  _pass "unwritable runtime append returns 0" ;;
  41) _fail "unwritable append returned nonzero" ;;
  42) _fail "unwritable append still wrote JSONL" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 5: rotation keeps a valid current JSONL"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  export DO_IT_EVENTS_MAX_BYTES=400
  export DO_IT_EVENTS_ROTATE_KEEP=2
  i=0
  while [[ "$i" -lt 12 ]]; do
    do_it_runtime_event_append test eval "rotation payload $i $(printf 'x%.0s' {1..40})" "$repo"
    i=$((i + 1))
  done
  log="$(do_it_evidence_log_path "$repo")"
  [[ -f "${log}.1" ]] || exit 51
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    jq -e . >/dev/null <<<"$line" || exit 52
  done < "$log"
  size="$(wc -c < "$log" | tr -d ' ')"
  [[ "$size" -lt 4000 ]] || exit 53
)
case "$?" in
  0)  _pass "rotation preserves a bounded valid JSONL" ;;
  51) _fail "rotated file was not created" ;;
  52) _fail "current JSONL after rotation was malformed" ;;
  53) _fail "rotation did not bound the live file" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 6: summary is bounded; user/eval sources persist"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  long="$(printf 'a%.0s' {1..1200})"
  do_it_runtime_event_append runtime-observation user "$long" "$repo"
  line="$(head -n1 "$(do_it_evidence_log_path "$repo")")"
  [[ "$(jq -r '.summary | length' <<<"$line")" -le 1000 ]] || exit 61
  do_it_runtime_event_append build eval "ci" "$repo"
  srcs="$(jq -r .source "$(do_it_evidence_log_path "$repo")" | sort | tr '\n' ' ')"
  [[ "$srcs" == "eval user " ]] || exit 62
)
case "$?" in
  0)  _pass "summary bound and user/eval sources persist" ;;
  61) _fail "summary exceeded 1000 characters" ;;
  62) _fail "user/eval sources were not stored" ;;
  *)  _fail "subshell crashed (exit=$?)" ;;
esac

echo "Case 7: FORCE_COVERAGE=partial rewrites complete without jq"
(
  export DO_IT_FORCE_NO_JQ=1
  source "$EVENTS"
  repo="$(_setup_repo)"
  do_it_observed_epoch_bump "$repo" >/dev/null
  DO_IT_EVENT_FORCE_COVERAGE=partial DO_IT_EVENT_HOST=kimi \
    do_it_runtime_event_append test observed "exit unavailable" "$repo"
  line="$(head -n1 "$(do_it_evidence_log_path "$repo")")"
  [[ "$(jq -r .worktree.coverage <<<"$line")" == "partial" ]] || exit 71
  [[ "$(jq -r .kind <<<"$line")" == "test" ]] || exit 72
)
case "$?" in
  0)  _pass "jq-free FORCE_COVERAGE=partial rewrites complete coverage" ;;
  71) _fail "jq-free forced coverage was not partial" ;;
  72) _fail "jq-free forced coverage kind mismatch" ;;
  *)  _fail "jq-free coverage case crashed (exit=$?)" ;;
esac

echo "Case 8: evidence.jsonl file symlink is refused"
(
  source "$EVENTS"
  repo="$(_setup_repo)"
  _do_it_runtime_prepare "$repo" || exit 81
  outside="$TMP_ROOT/escaped-evidence.jsonl"
  : > "$outside"
  ln -s "$outside" "$repo/.do-it/runtime/events/evidence.jsonl"
  st=0
  do_it_runtime_event_append edit observed "should not escape" "$repo" || st=$?
  [[ "$st" -eq 0 ]] || exit 82
  [[ ! -s "$outside" ]] || exit 83
)
case "$?" in
  0)  _pass "evidence.jsonl file symlink does not escape" ;;
  81) _fail "runtime prepare failed for symlink case" ;;
  82) _fail "symlink append returned nonzero" ;;
  83) _fail "evidence append followed a file symlink outside the repo" ;;
  *)  _fail "evidence symlink case crashed (exit=$?)" ;;
esac

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
