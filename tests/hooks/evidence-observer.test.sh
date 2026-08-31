#!/usr/bin/env bash
# Evidence observer: normalize host tool results into canonical candidates.
# Fail-open. Bounded digest only. Never auto-maps A-IDs or emits VERIFIED.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBSERVER="$REPO_ROOT/hooks/evidence-observer.sh"
FIXTURES="$REPO_ROOT/tests/fixtures/evidence"
VALIDATOR="$REPO_ROOT/scripts/validate-runtime-events.mjs"

if [[ ! -f "$OBSERVER" ]]; then
  echo "FAIL: evidence-observer.sh not found at $OBSERVER" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-observer.XXXXXX")"
export HOME="$TMP_ROOT/home"
mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE
unset DO_IT_EVENT_ACCEPTANCE_HINT DO_IT_EVENT_COMMAND DO_IT_EVENT_EXIT_CODE
unset DO_IT_EVENT_TASK_ID DO_IT_EVENT_HOST

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

_payload() {
  local fixture="$1" cwd="$2" file="${3:-}"
  jq -c --arg cwd "$cwd" --arg file "$file" '
    .cwd = $cwd
    | if $file != "" then .tool_input.file_path = $file else . end
  ' "$fixture"
}

_run_observer() {
  local payload="$1"
  printf '%s\n' "$payload" | bash "$OBSERVER"
}

_last_event() {
  local repo="$1" log
  log="$repo/.do-it/runtime/events/evidence.jsonl"
  [[ -f "$log" ]] || return 1
  tail -n1 "$log"
}

echo "Case 1: edit payload records an observed edit and bumps epoch"
(
  source "$OBSERVER"
  repo="$(_setup_repo)"
  payload="$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")"
  out="$(_run_observer "$payload")"
  [[ -z "$out" ]] || exit 11
  line="$(_last_event "$repo")" || exit 12
  [[ "$(jq -r .kind <<<"$line")" == "edit" ]] || exit 13
  [[ "$(jq -r .source <<<"$line")" == "observed" ]] || exit 14
  [[ "$(jq -r .schema <<<"$line")" == "1" ]] || exit 15
  [[ "$(jq -r .worktree.observed_epoch <<<"$line")" == "1" ]] || exit 16
  [[ "$(jq -r .summary <<<"$line")" == "edit README" ]] || exit 17
  jq -e 'has("acceptance_hint")' <<<"$line" >/dev/null && exit 18
  [[ "$(jq -r .worktree.coverage <<<"$line")" == "complete" ]] || exit 19
  node "$VALIDATOR" "$repo/.do-it/runtime/events/evidence.jsonl" >/dev/null || exit 20
)
case "$?" in
  0)  _pass "edit records schema-1 observed candidate and bumps epoch" ;;
  11) _fail "edit observer emitted stdout" ;;
  12) _fail "edit did not write evidence.jsonl" ;;
  13) _fail "edit kind mismatch" ;;
  14) _fail "edit source mismatch" ;;
  15) _fail "edit schema mismatch" ;;
  16) _fail "edit epoch was not 1" ;;
  17) _fail "edit summary mismatch" ;;
  18) _fail "edit auto-set acceptance_hint" ;;
  19) _fail "edit coverage was not complete" ;;
  20) _fail "edit event failed schema validation" ;;
  *)  _fail "edit case crashed (exit=$?)" ;;
esac

echo "Case 2: test command stores digest, not full output, and is kind=test"
(
  repo="$(_setup_repo)"
  payload="$(_payload "$FIXTURES/posttool-test.json" "$repo")"
  export DO_IT_EVENT_ACCEPTANCE_HINT="A1"
  out="$(_run_observer "$payload")"
  unset DO_IT_EVENT_ACCEPTANCE_HINT
  [[ -z "$out" ]] || exit 21
  line="$(_last_event "$repo")" || exit 22
  [[ "$(jq -r .kind <<<"$line")" == "test" ]] || exit 23
  [[ "$(jq -r .exit_code <<<"$line")" == "0" ]] || exit 24
  [[ "$(jq -r .command <<<"$line")" == "npm test --filter auth" ]] || exit 25
  summary="$(jq -r .summary <<<"$line")"
  [[ "$summary" == exit=0* ]] || exit 26
  [[ "$summary" == *digest=* ]] || exit 27
  [[ "$summary" != *secret-output-do-not-store* ]] || exit 28
  jq -e 'has("acceptance_hint")' <<<"$line" >/dev/null && exit 29
  node "$VALIDATOR" "$repo/.do-it/runtime/events/evidence.jsonl" >/dev/null || exit 20
)
case "$?" in
  0)  _pass "test command is digested and not mapped to an A-ID" ;;
  21) _fail "test observer emitted stdout" ;;
  22) _fail "test did not write evidence.jsonl" ;;
  23) _fail "test kind mismatch" ;;
  24) _fail "test exit_code mismatch" ;;
  25) _fail "test command mismatch" ;;
  26) _fail "test summary missing exit=0" ;;
  27) _fail "test summary missing digest" ;;
  28) _fail "test summary stored raw stdout" ;;
  29) _fail "test inherited acceptance_hint" ;;
  20) _fail "test event failed schema validation" ;;
  *)  _fail "test case crashed (exit=$?)" ;;
esac

echo "Case 3: build vs unrelated command classification"
(
  repo="$(_setup_repo)"
  _run_observer "$(_payload "$FIXTURES/posttool-build.json" "$repo")" >/dev/null
  _run_observer "$(_payload "$FIXTURES/posttool-command.json" "$repo")" >/dev/null
  log="$repo/.do-it/runtime/events/evidence.jsonl"
  kinds="$(jq -r .kind "$log" | tr '\n' ' ')"
  [[ "$kinds" == "build command " ]] || exit 31
  [[ "$(jq -r .exit_code "$log" | tr '\n' ' ')" == "0 0 " ]] || exit 32
)
case "$?" in
  0)  _pass "build and unrelated shell classify without becoming proof" ;;
  31) _fail "build/command kinds mismatch" ;;
  32) _fail "build/command exit codes mismatch" ;;
  *)  _fail "build/command case crashed (exit=$?)" ;;
esac

echo "Case 4: missing exit/output does not infer success"
(
  repo="$(_setup_repo)"
  _run_observer "$(_payload "$FIXTURES/posttool-no-exit.json" "$repo")" >/dev/null
  line="$(_last_event "$repo")" || exit 41
  [[ "$(jq -r .kind <<<"$line")" == "test" ]] || exit 42
  jq -e 'has("exit_code")' <<<"$line" >/dev/null && exit 43
  [[ "$(jq -r .summary <<<"$line")" == *"exit unavailable"* ]] || exit 44
)
case "$?" in
  0)  _pass "missing exit is recorded as unavailable, not 0" ;;
  41) _fail "no-exit did not write a row" ;;
  42) _fail "no-exit kind mismatch" ;;
  43) _fail "no-exit invented exit_code" ;;
  44) _fail "no-exit summary did not mark exit unavailable" ;;
  *)  _fail "no-exit case crashed (exit=$?)" ;;
esac

echo "Case 5: malformed payload and mode=off fail open"
(
  repo="$(_setup_repo)"
  st=0
  printf 'not-json{{{\n' | bash "$OBSERVER" >/dev/null 2>/dev/null || st=$?
  [[ "$st" -eq 0 ]] || exit 51
  [[ ! -f "$repo/.do-it/runtime/events/evidence.jsonl" ]] || exit 52
  payload="$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")"
  DO_IT_EVIDENCE_MODE=off _run_observer "$payload" >/dev/null
  [[ ! -f "$repo/.do-it/runtime/events/evidence.jsonl" ]] || exit 53
)
case "$?" in
  0)  _pass "malformed payload and mode=off stay silent and exit 0" ;;
  51) _fail "malformed payload returned nonzero" ;;
  52) _fail "malformed payload wrote a ledger" ;;
  53) _fail "mode=off still wrote a ledger" ;;
  *)  _fail "fail-open case crashed (exit=$?)" ;;
esac

echo "Case 6: unwritable runtime still exits 0"
(
  repo="$(_setup_repo)"
  mkdir -p "$repo/.do-it/runtime/events"
  chmod 500 "$repo/.do-it/runtime" "$repo/.do-it/runtime/events"
  payload="$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")"
  st=0
  _run_observer "$payload" >/dev/null 2>/dev/null || st=$?
  [[ "$st" -eq 0 ]] || exit 61
  [[ ! -s "$repo/.do-it/runtime/events/evidence.jsonl" ]] || exit 62
)
case "$?" in
  0)  _pass "unwritable runtime observer returns 0" ;;
  61) _fail "unwritable observer returned nonzero" ;;
  62) _fail "unwritable observer still wrote JSONL" ;;
  *)  _fail "unwritable case crashed (exit=$?)" ;;
esac

echo "Case 7: active-task is copied as task_id, never as an A-ID"
(
  source "$OBSERVER"
  repo="$(_setup_repo)"
  mkdir -p "$repo/.do-it/plans"
  printf '# Goal\n\n# Decisions\n\n# Boundary\n\n# Acceptance\n' > "$repo/.do-it/plans/sample.md"
  do_it_active_task_write ".do-it/plans/sample.md" "$repo" || exit 71
  payload="$(_payload "$FIXTURES/posttool-test.json" "$repo")"
  _run_observer "$payload" >/dev/null
  line="$(_last_event "$repo")" || exit 72
  [[ "$(jq -r .task_id <<<"$line")" == ".do-it/plans/sample.md" ]] || exit 73
  if jq -e 'has("acceptance_hint")' <<<"$line" >/dev/null; then
    exit 74
  fi
)
case "$?" in
  0)  _pass "active-task pointer is stored without A-ID mapping" ;;
  71) _fail "active-task write failed" ;;
  72) _fail "task_id case wrote no event" ;;
  73) _fail "task_id mismatch" ;;
  74) _fail "task_id path set acceptance_hint" ;;
  *)  _fail "task_id case crashed (exit=$?)" ;;
esac

echo "Case 8: freshness — later edit stale; matching fingerprint after edit is fresh"
(
  source "$OBSERVER"
  repo="$(_setup_repo)"
  _run_observer "$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")" >/dev/null
  _run_observer "$(_payload "$FIXTURES/posttool-test.json" "$repo")" >/dev/null
  fresh="$(do_it_evidence_freshness "$repo")"
  [[ "$(jq -r .status <<<"$fresh")" == "fresh" ]] || exit 81
  _run_observer "$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")" >/dev/null
  stale="$(do_it_evidence_freshness "$repo")"
  [[ "$(jq -r .status <<<"$stale")" == "stale" ]] || exit 82
  [[ "$(jq -r .reason <<<"$stale")" == "edit-after-evidence" ]] || exit 83
)
case "$?" in
  0)  _pass "evidence after last edit is fresh; a later edit makes it stale" ;;
  81) _fail "test after edit was not fresh" ;;
  82) _fail "edit after test was not stale" ;;
  83) _fail "stale reason mismatch" ;;
  *)  _fail "freshness order case crashed (exit=$?)" ;;
esac

echo "Case 9: different fingerprint/head is not fresh; malformed ledger fail-open"
(
  source "$OBSERVER"
  repo="$(_setup_repo)"
  _run_observer "$(_payload "$FIXTURES/posttool-edit.json" "$repo" "$repo/README")" >/dev/null
  _run_observer "$(_payload "$FIXTURES/posttool-test.json" "$repo")" >/dev/null
  printf 'dirty\n' >> "$repo/README"
  mismatch="$(do_it_evidence_freshness "$repo")"
  [[ "$(jq -r .status <<<"$mismatch")" == "stale" ]] || exit 91
  [[ "$(jq -r .reason <<<"$mismatch")" == "fingerprint-mismatch" ]] || exit 92
  mkdir -p "$repo/.do-it/runtime/events"
  cat "$FIXTURES/invalid-malformed-ledger.jsonl" > "$repo/.do-it/runtime/events/evidence.jsonl"
  bad="$(do_it_evidence_freshness "$repo")"
  [[ "$(jq -r .status <<<"$bad")" == "malformed" ]] || exit 93
  [[ "$(jq -r .diagnostic <<<"$bad")" == *"unreadable"* ]] || exit 94
)
case "$?" in
  0)  _pass "fingerprint mismatch and malformed ledger are not fresh" ;;
  91) _fail "dirty worktree still reported fresh" ;;
  92) _fail "dirty worktree reason was not fingerprint-mismatch" ;;
  93) _fail "malformed ledger was not malformed" ;;
  94) _fail "malformed ledger omitted bounded diagnostic" ;;
  *)  _fail "mismatch/malformed case crashed (exit=$?)" ;;
esac

echo "Case 10: fixture JSONL schema samples"
(
  node "$VALIDATOR" \
    "$FIXTURES/valid-observed-edit.jsonl" \
    "$FIXTURES/valid-observed-test.jsonl" \
    "$FIXTURES/invalid-malformed-ledger.jsonl" >/dev/null
)
case "$?" in
  0)  _pass "evidence fixtures match the event schema contract" ;;
  *)  _fail "evidence fixture schema check failed" ;;
esac

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
