#!/usr/bin/env bash
# Smoke tests for hooks/write-quality-lint.sh (tier gate + new families).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/write-quality-lint.sh"
export CLAUDE_PLUGIN_DATA="${TMPDIR:-/tmp}/do-it-wql-test-$$"
mkdir -p "$CLAUDE_PLUGIN_DATA"
trap 'rm -rf "$CLAUDE_PLUGIN_DATA"' EXIT

PASS=0
FAIL=0

_setup_repo() {
  local dir
  dir="$(mktemp -d -t doit-wql-XXXXXX)"
  ( cd "$dir" && git init -q && git config user.email t@e.com && git config user.name t ) >/dev/null 2>&1
  printf '%s' "$dir"
}

_run_hook() {
  local file="$1" session="${2:-wql-test}" tier="${3:-Heavy}"
  local payload
  payload=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"%s","cwd":"%s"}' \
    "$file" "$session" "$(dirname "$file")")
  if command -v jq >/dev/null 2>&1; then
  printf '%s' "$payload" | jq --arg tier "$tier" '. + {tier: $tier}' 2>/dev/null | {
    # seed tier via router first
    true
  }
  fi
  # seed session state
  mkdir -p "$CLAUDE_PLUGIN_DATA/sessions/$session"
  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg tier "$tier" --arg touch "${4:-1}" \
      '{tier: $tier, dim_touches_code: $touch, user_turn: "1"}' \
      > "$CLAUDE_PLUGIN_DATA/sessions/$session/state.json"
  fi
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
}

_assert_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF "$needle"; then
    echo "  ok: $label"; PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected: $needle" >&2; FAIL=$((FAIL + 1))
  fi
}

_assert_not_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF "$needle"; then
    echo "  FAIL: $label — unexpected: $needle" >&2; FAIL=$((FAIL + 1))
  else
    echo "  ok: $label"; PASS=$((PASS + 1))
  fi
}

echo "Case 1: swallow-error family"
DIR=$(_setup_repo)
FILE="$DIR/err.ts"
printf 'export function f() {}\n' > "$FILE"
( cd "$DIR" && git add err.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
export function f() {
  try { return 1; } catch (e) {}
}
EOF
OUT=$(_run_hook "$FILE" "swallow" "Heavy")
_assert_contains "flags swallow-error" "$OUT" "swallow-error"
rm -rf "$DIR"

echo "Case 2: Light tier skips"
DIR=$(_setup_repo)
FILE="$DIR/light.ts"
printf 'x\n' > "$FILE"
( cd "$DIR" && git add light.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
// 添加了新分支 issue #123
export const x = 1;
EOF
OUT=$(_run_hook "$FILE" "light-skip" "Light")
_assert_not_contains "Light tier silent" "$OUT" "system-reminder"
rm -rf "$DIR"

echo
echo "Summary: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] || exit 1
echo "ok: $PASS tests"
