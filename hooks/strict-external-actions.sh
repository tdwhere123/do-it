#!/usr/bin/env bash
# Claude-only, opt-in PreToolUse decision for named external actions.
#
# This hook is intentionally inert unless the parent Claude process starts with
# DO_IT_STRICT_EXTERNAL_ACTIONS=ask (or =deny). The configuration narrows the
# common path, but this script verifies the Bash input itself as a compatibility
# backstop for Claude versions that do not honor `if`. It never reflects raw
# command text or stdin.

set -uo pipefail

ACTION="${1:-}"
case "$ACTION" in
  git-push) ACTION_LABEL="git push" ;;
  gh-pr-merge) ACTION_LABEL="gh pr merge" ;;
  npm-publish) ACTION_LABEL="npm publish" ;;
  pnpm-publish) ACTION_LABEL="pnpm publish" ;;
  yarn-npm-publish) ACTION_LABEL="yarn npm publish" ;;
  kubectl-apply) ACTION_LABEL="kubectl apply" ;;
  terraform-apply) ACTION_LABEL="terraform apply" ;;
  *) exit 0 ;;
esac

strict_input_matches_action() {
  local input="$1" action="$2" pattern
  # Match only a direct command value at the start of the JSON Bash command.
  # This is deliberately conservative: a compound wrapper that cannot be
  # recognized reliably receives no hook decision rather than a broad prompt.
  case "$action" in
    git-push) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*git[[:space:]]+push([[:space:]]|"|;|&|\|)' ;;
    gh-pr-merge) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*gh[[:space:]]+pr[[:space:]]+merge([[:space:]]|"|;|&|\|)' ;;
    npm-publish) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*npm[[:space:]]+publish([[:space:]]|"|;|&|\|)' ;;
    pnpm-publish) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*pnpm[[:space:]]+publish([[:space:]]|"|;|&|\|)' ;;
    yarn-npm-publish) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*yarn[[:space:]]+npm[[:space:]]+publish([[:space:]]|"|;|&|\|)' ;;
    kubectl-apply) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*kubectl[[:space:]]+apply([[:space:]]|"|;|&|\|)' ;;
    terraform-apply) pattern='"command"[[:space:]]*:[[:space:]]*"[[:space:]]*terraform[[:space:]]+apply([[:space:]]|"|;|&|\|)' ;;
    *) return 1 ;;
  esac
  [[ "$input" =~ $pattern ]]
}

# `read` is a Bash builtin, so the backstop works without jq or an external
# parser. The full input stays process-local and is never written or echoed.
RAW_INPUT=""
IFS= read -r -d '' RAW_INPUT || true
strict_input_matches_action "$RAW_INPUT" "$ACTION" || exit 0

case "${DO_IT_STRICT_EXTERNAL_ACTIONS:-}" in
  ask|on) DECISION="ask" ;;
  deny) DECISION="deny" ;;
  *) exit 0 ;;
esac

printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"%s","permissionDecisionReason":"do-it strict external-actions profile: %s requires an explicit user decision."}}\n' \
  "$DECISION" "$ACTION_LABEL"
