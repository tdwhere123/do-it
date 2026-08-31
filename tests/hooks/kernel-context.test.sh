#!/usr/bin/env bash
# Injection contract for hooks/kernel-context.sh.
# Usage: bash tests/hooks/kernel-context.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/kernel-context.sh"

if [[ ! -f "$HOOK" ]]; then
  echo "FAIL: kernel-context.sh not found at $HOOK" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-kernel-context.XXXXXX")"
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE

cleanup() { chmod -R u+w "$TMP_ROOT" 2>/dev/null || true; rm -rf "$TMP_ROOT"; }
trap cleanup EXIT

_pass() { echo "  ok: $1"; PASS=$((PASS + 1)); }
_fail() { echo "  FAIL: $1" >&2; FAIL=$((FAIL + 1)); }

_isolate() {
  export DO_IT_HOOK_DATA="$1"
  rm -rf "$DO_IT_HOOK_DATA"
  mkdir -p "$DO_IT_HOOK_DATA"
  unset CLAUDE_PLUGIN_DATA CODEX_HOME KIMI_CODE_HOME KIMI_PLUGIN_ROOT
  unset CLAUDE_AGENT_CONTEXT CLAUDE_SUBAGENT CURSOR_PLUGIN_DATA CURSOR_PLUGIN_ROOT
  unset CURSOR_SUBAGENT PI_SUBAGENT_CHILD DO_IT_DEBUG DO_IT_CONTEXT_OUTPUT
  unset OPENCODE_MODEL ANTHROPIC_MODEL OPENAI_MODEL CODEX_MODEL KIMI_MODEL PI_MODEL
  unset DO_IT_ADVISORY_MODE
  export DO_IT_ROUTER_MODE=shadow
}

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

_run_hook() {
  local session_id="$1" cwd="$2" prompt="${3:-fix the helper}" transcript="${4:-}"
  jq -nc --arg sid "$session_id" --arg cwd "$cwd" --arg prompt "$prompt" \
    --arg transcript "$transcript" \
    '{session_id:$sid, cwd:$cwd, prompt:$prompt, transcript_path:$transcript}' \
    | bash "$HOOK"
}

_context() {
  local out="$1"
  [[ -n "$out" ]] || { printf ''; return 0; }
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null
}

KERNEL_NEEDLE='Do-it kernel: read current repository truth'

echo "Case 1: legacy mode is silent"
_isolate "$TMP_ROOT/data-legacy"
export DO_IT_ROUTER_MODE=legacy
out="$(_run_hook legacy1 /tmp)"
if [[ -z "$out" ]]; then
  _pass "legacy kernel-context is silent"
else
  _fail "legacy leaked context: $out"
fi

echo "Case 2: invalid mode fail-opens to legacy"
_isolate "$TMP_ROOT/data-invalid"
export DO_IT_ROUTER_MODE=wat
out="$(_run_hook invalid1 /tmp)"
if [[ -z "$out" ]]; then
  _pass "invalid mode is silent (legacy)"
else
  _fail "invalid mode leaked context: $out"
fi

echo "Case 3: shadow injects one short kernel; no pointer/inline switch"
_isolate "$TMP_ROOT/data-c3"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
out="$(_run_hook c3 "$repo" "实现 src/auth.ts 的登录")"
ctx="$(_context "$out")"
if [[ "$ctx" == *"$KERNEL_NEEDLE"* \
   && "$ctx" != *"do-it tier: Standard"* \
   && "$ctx" != *"skill://do-it-core"* \
   && "$ctx" != *"do-it adaptive:"* \
   && "$ctx" != *"Active do-it contract:"* ]]; then
  _pass "shadow first prompt injects kernel only"
else
  _fail "shadow first prompt shape wrong: $ctx"
fi

echo "Case 4: same session ordinary prompt does not re-inject kernel"
_isolate "$TMP_ROOT/data-c4"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
first="$(_run_hook c4 "$repo")"
second="$(_run_hook c4 "$repo" "continue the helper")"
if [[ -n "$first" && -z "$second" ]]; then
  _pass "unchanged session stays silent"
else
  _fail "once-per-session failed first=${#first} second=${#second}"
fi

echo "Case 5: missing profile/active-task adds no extra lines"
_isolate "$TMP_ROOT/data-c5"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=thin
out="$(_run_hook c5 "$repo")"
ctx="$(_context "$out")"
if [[ "$ctx" == *"$KERNEL_NEEDLE"* \
   && "$ctx" != *"Active do-it contract:"* \
   && "$ctx" != *"do-it adaptive:"* ]]; then
  _pass "missing profile/task is kernel-only"
else
  _fail "missing profile/task leaked extra lines: $ctx"
fi

echo "Case 6: active-task injects on first sight and on change"
_isolate "$TMP_ROOT/data-c6"
repo="$(_setup_repo)"
mkdir -p "$repo/.do-it/plans" "$repo/.do-it/runtime"
printf '# Goal\n' > "$repo/.do-it/plans/auth.md"
printf '.do-it/plans/auth.md\n' > "$repo/.do-it/runtime/active-task"
export DO_IT_ROUTER_MODE=shadow
first="$(_context "$(_run_hook c6 "$repo")")"
if [[ "$first" == *"$KERNEL_NEEDLE"* \
   && "$first" == *"Active do-it contract: .do-it/plans/auth.md."* ]]; then
  _pass "active-task line on first inject"
else
  _fail "active-task first inject wrong: $first"
fi
second="$(_run_hook c6 "$repo" "continue")"
if [[ -z "$second" ]]; then
  _pass "unchanged active-task is silent"
else
  _fail "unchanged active-task re-injected: $second"
fi
printf '.do-it/plans/other.md\n' > "$repo/.do-it/runtime/active-task"
printf '# Goal\n' > "$repo/.do-it/plans/other.md"
third="$(_context "$(_run_hook c6 "$repo" "now the other card")")"
if [[ "$third" == *"Active do-it contract: .do-it/plans/other.md."* \
   && "$third" != *"$KERNEL_NEEDLE"* ]]; then
  _pass "active-task change re-injects pointer only"
else
  _fail "active-task change wrong: $third"
fi

echo "Case 7: no-write is every turn and survives once-dedup"
_isolate "$TMP_ROOT/data-c7"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
first="$(_context "$(_run_hook c7 "$repo" "Review src/auth.ts; do not edit.")")"
second="$(_context "$(_run_hook c7 "$repo" "continue inspecting src/auth.ts")")"
if [[ "$first" == *"no-write boundary is active"* \
   && "$first" == *"$KERNEL_NEEDLE"* \
   && "$second" == *"no-write boundary is active"* \
   && "$second" != *"$KERNEL_NEEDLE"* ]]; then
  _pass "no-write every turn; kernel only once"
else
  _fail "no-write dedup wrong first='$first' second='$second'"
fi

echo "Case 8: model name does not switch pointer vs inline"
_isolate "$TMP_ROOT/data-c8"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=thin
claude="$(_context "$(OPENCODE_MODEL=claude-sonnet-4-5 _run_hook c8a "$repo")")"
_isolate "$TMP_ROOT/data-c8b"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=thin
deepseek="$(_context "$(OPENCODE_MODEL=deepseek-v4-flash _run_hook c8b "$repo")")"
if [[ "$claude" == *"$KERNEL_NEEDLE"* \
   && "$deepseek" == *"$KERNEL_NEEDLE"* \
   && "$claude" != *"skill://do-it-core"* \
   && "$deepseek" != *"skill://do-it-core"* ]]; then
  _pass "all models get the same short kernel"
else
  _fail "model switch leaked claude='$claude' deepseek='$deepseek'"
fi

echo "Case 9: subagent context is silent"
_isolate "$TMP_ROOT/data-c9"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
out="$(_run_hook c9 "$repo" "fix the helper" "$TMP_ROOT/agents/child.jsonl")"
if [[ -z "$out" ]]; then
  _pass "subagent suppresses kernel"
else
  _fail "subagent leaked: $out"
fi

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
