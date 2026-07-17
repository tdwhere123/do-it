#!/usr/bin/env bash
# Regression tests for the Claude-only opt-in PreToolUse profile. The
# registration does matching; this script only returns a static decision for an
# explicitly named action and never reflects raw tool input.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/strict-external-actions.sh"
[[ -x "$HOOK" || -f "$HOOK" ]] || { echo "FAIL: missing $HOOK" >&2; exit 1; }
BASH_BIN="${BASH:-}"
if [[ ! -x "$BASH_BIN" ]]; then
  BASH_BIN="$(command -v bash 2>/dev/null || true)"
fi
[[ -x "$BASH_BIN" ]] || { echo "FAIL: unable to resolve bash" >&2; exit 1; }

PASS=0
FAIL=0

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_run() {
  local mode="$1" action="$2" command="${3:-git push secret-command-marker}"
  printf '{"tool_name":"Bash","tool_input":{"command":"%s"}}' "$command" \
    | env -u KIMI_CODE_HOME -u KIMI_PLUGIN_ROOT DO_IT_STRICT_EXTERNAL_ACTIONS="$mode" bash "$HOOK" "$action"
}

_assert_empty() {
  local label="$1" output="$2"
  if [[ -z "$output" ]]; then _pass "$label"; else _fail "$label (got: $output)"; fi
}

_assert_decision() {
  local label="$1" expected="$2" action="$3" output="$4"
  if printf '%s' "$output" | jq -e --arg decision "$expected" --arg action "$action" '
    .hookSpecificOutput.hookEventName == "PreToolUse"
    and .hookSpecificOutput.permissionDecision == $decision
    and (.hookSpecificOutput.permissionDecisionReason | contains($action))
  ' >/dev/null 2>&1; then
    _pass "$label"
  else
    _fail "$label (got: $output)"
  fi
}

echo "Case 1: default and invalid modes stay inert"
_assert_empty "unset profile emits no decision" "$(_run '' git-push)"
_assert_empty "invalid profile emits no decision" "$(_run true git-push)"
_assert_empty "unknown action emits no decision" "$(_run ask not-an-action)"
_assert_empty "static action cannot widen an unrelated Bash command" "$(_run ask git-push 'npm test')"

echo "Case 2: ask is the explicit confirmation mode"
out="$(_run ask git-push)"
_assert_decision "ask emits a valid PreToolUse confirmation" ask "git push" "$out"
if [[ "$out" == *"secret-command-marker"* ]]; then
  _fail "ask output reflects raw tool input"
else
  _pass "ask output never reflects raw tool input"
fi
_assert_decision "on remains an ergonomic ask alias" ask "npm publish" "$(_run on npm-publish 'npm publish package-name')"

echo "Case 3: deny is an explicit emergency stop, not a confirmation"
_assert_decision "deny emits a valid PreToolUse denial" deny "terraform apply" "$(_run deny terraform-apply 'terraform apply -auto-approve')"

echo "Case 4: hook does not depend on jq or external parsing"
out="$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"kubectl apply -f deployment.yaml"}}' | PATH=/definitely-missing DO_IT_STRICT_EXTERNAL_ACTIONS=ask "$BASH_BIN" "$HOOK" kubectl-apply)"
_assert_decision "ask still works without jq on PATH" ask "kubectl apply" "$out"

if [[ "$FAIL" -ne 0 ]]; then
  echo "FAIL: $FAIL test(s) failed" >&2
  exit 1
fi

echo "ok: $PASS tests"
