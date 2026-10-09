#!/usr/bin/env bash
# do-it hook debug helper. When DO_IT_DEBUG=1 in the environment, hooks emit
# structured single-line decision traces to stderr so the operator can see WHY
# a particular tier / trigger / block was chosen without instrumenting the
# Claude Code transcript itself.
#
# Output format (each line is independently parseable):
#   [do-it <hook>] key1=value1 key2="value with spaces" ...
#
# Always uses stderr. Never writes when DO_IT_DEBUG is unset / 0 / false.

# Internal: emit a single trace line. Args: <hook-name> <free-form fields...>.
do_it_debug() {
  case "${DO_IT_DEBUG:-0}" in
    ''|0|false|FALSE|off|OFF) return 0 ;;
  esac
  local hook="$1"; shift
  printf '[do-it %s] %s\n' "$hook" "$*" >&2
}
