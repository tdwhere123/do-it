#!/usr/bin/env bash
# Lint do-it hook scripts with shellcheck. Entry-point hooks pull lib/*.sh via
# `# shellcheck source=...` directives, so we only invoke shellcheck on the
# entry points and let `-x` follow the sources.
#
# Usage:
#   bash scripts/lint-hooks.sh           # severity=warning (default)
#   bash scripts/lint-hooks.sh --strict  # severity=info; promotes more checks
#
# Requires shellcheck >= 0.9. Install:
#   - apt:    sudo apt-get install shellcheck
#   - brew:   brew install shellcheck
#   - manual: https://github.com/koalaman/shellcheck/releases  (extract binary
#             into ~/.local/bin)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v shellcheck >/dev/null 2>&1; then
  cat >&2 <<'MSG'
[lint-hooks] shellcheck not on PATH.
  apt:    sudo apt-get install shellcheck
  brew:   brew install shellcheck
  manual: download from https://github.com/koalaman/shellcheck/releases
          and extract `shellcheck` into ~/.local/bin
MSG
  exit 127
fi

severity="warning"
if [[ "${1:-}" == "--strict" ]]; then
  severity="info"
fi

entry_points=(
  hooks/router.sh
  hooks/grill-prompt.sh
  hooks/grill-pretool.sh
  hooks/verification-gate.sh
  hooks/code-map-refresh.sh
)

# `-x` lets shellcheck follow `# shellcheck source=...` lines so the lib files
# get linted in the context that actually consumes them.
shellcheck -x -P hooks/lib --severity="$severity" "${entry_points[@]}"

echo "[lint-hooks] ok (severity=$severity, files=${#entry_points[@]})"
