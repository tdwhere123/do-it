#!/usr/bin/env bash
# Smoke tests for hooks/comments-lint.sh.
#
# Each case sets up a temporary git repo, stages a base file, edits it (or
# creates a new file), and feeds the hook a synthetic PostToolUse JSON blob.
# We assert on the presence/absence of the system-reminder string in stdout.
#
# Usage: bash tests/hooks/comments-lint.test.sh
# Exits non-zero on first failure; otherwise prints "ok: <N> tests".

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="$REPO_ROOT/hooks/comments-lint.sh"

if [[ ! -x "$HOOK" ]]; then
  if [[ ! -f "$HOOK" ]]; then
    echo "FAIL: hook not found at $HOOK" >&2
    exit 1
  fi
fi

PASS=0
FAIL=0

_setup_repo() {
  local dir
  dir="$(mktemp -d -t doit-comments-lint-XXXXXX)"
  ( cd "$dir" \
    && git init -q \
    && git config user.email test@example.com \
    && git config user.name test ) >/dev/null 2>&1
  printf '%s' "$dir"
}

_run_hook() {
  local file="$1"
  local payload
  payload=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"},"session_id":"test","cwd":"%s"}' \
    "$file" "$(dirname "$file")")
  printf '%s' "$payload" | bash "$HOOK" 2>/dev/null
}

_assert_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF "$needle"; then
    echo "  ok: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label — expected to find: $needle" >&2
    echo "  output was: $output" >&2
    FAIL=$((FAIL + 1))
  fi
}

_assert_not_contains() {
  local label="$1" output="$2" needle="$3"
  if printf '%s' "$output" | grep -qF "$needle"; then
    echo "  FAIL: $label — unexpected match: $needle" >&2
    echo "  output was: $output" >&2
    FAIL=$((FAIL + 1))
  else
    echo "  ok: $label"
    PASS=$((PASS + 1))
  fi
}

# -------------------------------------------------------------------------
echo "Case 1: history narrative + task ref → flagged"
DIR=$(_setup_repo)
FILE="$DIR/test.ts"
printf 'function foo() { return 1; }\n' > "$FILE"
( cd "$DIR" && git add test.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
function foo() {
  // 添加了新分支 issue #123
  // 之前是 RSA，现在改成 Ed25519
  return 1;
}
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "flags history narrative" "$OUT" "system-reminder"
_assert_contains "names file" "$OUT" "test.ts"
_assert_contains "names history family (skill cause class)" "$OUT" "history"
_assert_contains "names task-ref family (skill cause class)" "$OUT" "task-ref"
_assert_not_contains "no legacy history-narrative label" "$OUT" "history-narrative"
_assert_not_contains "no legacy task-reference label" "$OUT" "task-reference"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 2: orphan TODO → flagged"
DIR=$(_setup_repo)
FILE="$DIR/test.py"
printf 'def f():\n    return 1\n' > "$FILE"
( cd "$DIR" && git add test.py && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
def f():
    # TODO clean this up later
    return 1
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "flags orphan TODO" "$OUT" "orphan-todo"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 3: tombstone → flagged"
DIR=$(_setup_repo)
FILE="$DIR/test.go"
printf 'package main\n' > "$FILE"
( cd "$DIR" && git add test.go && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
package main

// removed: legacyValidate()
// gone: deprecated handler
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "flags tombstone" "$OUT" "tombstone"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 4: clean code (allowed categories only) → silent"
DIR=$(_setup_repo)
FILE="$DIR/test.ts"
printf 'function foo() { return 1; }\n' > "$FILE"
( cd "$DIR" && git add test.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
function foo() {
  // @anchor:foo-return
  // invariant: caller holds the user-row lock
  // see also: src/auth/refresh.ts:rotateToken
  return 1;
}
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "no reminder for clean code" "$OUT" "system-reminder"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 5: untracked new file with bad comments → flagged"
DIR=$(_setup_repo)
( cd "$DIR" && touch .keep && git add .keep && git commit -q -m init ) >/dev/null 2>&1
FILE="$DIR/new.js"
cat > "$FILE" <<'EOF'
// fixed null pointer crash
// TODO later
function bar() {}
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "flags new untracked file" "$OUT" "system-reminder"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 6: out-of-scope extension → silent"
DIR=$(_setup_repo)
FILE="$DIR/notes.md"
printf 'hello\n' > "$FILE"
( cd "$DIR" && git add notes.md && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
fixed bug previously
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "ignores .md" "$OUT" "system-reminder"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 7: comments-lint-allow escape → silent"
DIR=$(_setup_repo)
FILE="$DIR/esc.ts"
printf 'function f() {}\n' > "$FILE"
( cd "$DIR" && git add esc.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
function f() {
  // fixed null crash — comments-lint-allow: legacy header, see CHANGELOG
}
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "honors allow-list" "$OUT" "system-reminder"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 8a: fix narrative → flagged as fix-narrative (separate from history)"
DIR=$(_setup_repo)
FILE="$DIR/fix.ts"
printf 'function f() {}\n' > "$FILE"
( cd "$DIR" && git add fix.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
function f() {
  // fix: handle null user
  // 修正了 cache 失效逻辑
}
EOF
OUT=$(_run_hook "$FILE")
_assert_contains "flags fix narrative" "$OUT" "system-reminder"
_assert_contains "names fix-narrative family" "$OUT" "fix-narrative"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo "Case 9: properly-formed TODO with owner → silent on TODO axis"
DIR=$(_setup_repo)
FILE="$DIR/well.ts"
printf 'function f() {}\n' > "$FILE"
( cd "$DIR" && git add well.ts && git commit -q -m base ) >/dev/null 2>&1
cat > "$FILE" <<'EOF'
function f() {
  // TODO(@alice): drop fallback once auth-v3 ships in #ENG-204.
}
EOF
OUT=$(_run_hook "$FILE")
_assert_not_contains "owner-tagged TODO ok" "$OUT" "orphan-todo"
rm -rf "$DIR"

# -------------------------------------------------------------------------
echo
echo "Summary: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "ok: $PASS tests"
