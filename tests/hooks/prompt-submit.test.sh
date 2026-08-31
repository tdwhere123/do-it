#!/usr/bin/env bash
# Mode-aware UserPromptSubmit orchestration for hooks/prompt-submit.sh.
# Usage: bash tests/hooks/prompt-submit.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/prompt-submit.sh"

if [[ ! -f "$HOOK" ]]; then
  echo "FAIL: prompt-submit.sh not found at $HOOK" >&2
  exit 1
fi

PASS=0
FAIL=0
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/doit-prompt-submit.XXXXXX")"
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
  unset DO_IT_ADVISORY_MODE DO_IT_ROUTER_MODE
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

_run() {
  local sid="$1" prompt="$2" cwd="${3:-/tmp}"
  jq -nc --arg sid "$sid" --arg prompt "$prompt" --arg cwd "$cwd" \
    '{session_id:$sid, prompt:$prompt, cwd:$cwd, transcript_path:""}' \
    | bash "$HOOK"
}

_context() {
  local out="$1"
  [[ -n "$out" ]] || { printf ''; return 0; }
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null
}

_state() {
  local sid="$1" key="$2"
  local state="$DO_IT_HOOK_DATA/sessions/$sid/state.json"
  [[ -f "$state" ]] || { printf ''; return 0; }
  jq -r --arg k "$key" '.[$k] // empty' "$state"
}

KERNEL_NEEDLE='Do-it kernel: read current repository truth'
HEAVY_PROMPT='Prepare the release schema migration'
STANDARD_PROMPT='实现 src/auth.ts 的登录'

echo "Case 1: default/legacy Heavy still grills (0.16 compatible)"
_isolate "$TMP_ROOT/data-legacy"
out="$(_run legacy-heavy "$HEAVY_PROMPT")"
ctx="$(_context "$out")"
if [[ "$ctx" == *"do-it grill"* && "$ctx" == *"heavy-tier"* ]]; then
  _pass "legacy Heavy still grills"
else
  _fail "legacy Heavy lost grill: $ctx"
fi

echo "Case 2: shadow Standard injects kernel once, never classifier text"
_isolate "$TMP_ROOT/data-shadow"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
first="$(_context "$(_run shadow-std "$STANDARD_PROMPT" "$repo")")"
tier="$(_state shadow-std tier)"
second="$(_context "$(_run shadow-std "continue the login helper" "$repo")")"
if [[ "$first" == *"$KERNEL_NEEDLE"* \
   && "$first" != *"do-it tier: Standard"* \
   && "$first" != *"skill://do-it-core"* \
   && "$first" != *"do-it grill"* \
   && -z "$second" ]]; then
  _pass "shadow kernel once; classifier stays out of context"
else
  _fail "shadow Standard wrong first='$first' second='$second'"
fi
if [[ "$tier" == "Standard" ]]; then
  _pass "shadow still records classifier diagnostics"
else
  _fail "shadow did not persist Standard tier (got '$tier')"
fi

echo "Case 3: shadow Heavy does not grill or emit architecture pointer"
_isolate "$TMP_ROOT/data-shadow-heavy"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
out="$(_context "$(_run shadow-heavy "$HEAVY_PROMPT" "$repo")")"
if [[ "$out" == *"$KERNEL_NEEDLE"* \
   && "$out" != *"do-it grill"* \
   && "$out" != *"skill://do-it-architecture"* \
   && "$out" != *"pressure-test only the load-bearing"* ]]; then
  _pass "shadow Heavy keeps classifier out of context"
else
  _fail "shadow Heavy leaked classifier/grill: $out"
fi

echo "Case 4: thin skips classifier state and grill"
_isolate "$TMP_ROOT/data-thin"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=thin
out="$(_context "$(_run thin-heavy "$HEAVY_PROMPT" "$repo")")"
tier="$(_state thin-heavy tier)"
if [[ "$out" == *"$KERNEL_NEEDLE"* \
   && "$out" != *"do-it grill"* \
   && -z "$tier" ]]; then
  _pass "thin injects kernel and skips classifier"
else
  _fail "thin wrong out='$out' tier='$tier'"
fi

echo "Case 5: no-write reminder is not lost to once-dedup"
_isolate "$TMP_ROOT/data-nowrite"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
first="$(_context "$(_run nw "Review src/auth.ts; do not edit." "$repo")")"
second="$(_context "$(_run nw "continue inspecting callers" "$repo")")"
if [[ "$first" == *"no-write boundary is active"* \
   && "$first" == *"$KERNEL_NEEDLE"* \
   && "$second" == *"no-write boundary is active"* \
   && "$second" != *"$KERNEL_NEEDLE"* ]]; then
  _pass "no-write every turn under shadow"
else
  _fail "no-write lost first='$first' second='$second'"
fi

echo "Case 6: missing profile/task adds no extra lines"
_isolate "$TMP_ROOT/data-empty"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=thin
out="$(_context "$(_run empty1 "$STANDARD_PROMPT" "$repo")")"
if [[ "$out" == *"$KERNEL_NEEDLE"* \
   && "$out" != *"do-it adaptive:"* \
   && "$out" != *"Active do-it contract:"* ]]; then
  _pass "no extra lines without profile/task"
else
  _fail "empty extras leaked: $out"
fi

echo "Case 7: explicit grill in shadow is a compatibility diagnostic"
_isolate "$TMP_ROOT/data-explicit"
repo="$(_setup_repo)"
export DO_IT_ROUTER_MODE=shadow
out="$(_context "$(_run expl "please grill this migration plan" "$repo")")"
if [[ "$out" == *"Compatibility diagnostic only"* \
   && "$out" != *"pressure-test only the load-bearing premise"* ]]; then
  _pass "shadow explicit grill is diagnostic-only"
else
  _fail "explicit grill wrong: $out"
fi

echo "Case 8: adaptive profile injects once, then stays quiet"
_isolate "$TMP_ROOT/data-adaptive"
repo="$(_setup_repo)"
mkdir -p "$repo/.do-it/runtime/adaptive"
cat > "$repo/.do-it/runtime/adaptive/profile.md" <<'MD'
---
schema: do-it/adaptive-profile/v1
---

## Active
- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking.
MD
export DO_IT_ROUTER_MODE=shadow
first="$(_context "$(_run adp "$STANDARD_PROMPT" "$repo")")"
second="$(_context "$(_run adp "continue" "$repo")")"
if [[ "$first" == *"$KERNEL_NEEDLE"* \
   && "$first" == *"- P001 [all] Resolve low-risk reversible ambiguity autonomously instead of asking."* \
   && -z "$second" ]]; then
  _pass "adaptive injects with first kernel, not again"
else
  _fail "adaptive orchestration wrong first='$first' second='$second'"
fi

echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
