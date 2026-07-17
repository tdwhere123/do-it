/**
 * Single source of truth for the shipped hook scripts and per-host wiring.
 *
 * The three plugin build scripts (build-codex/cursor/opencode-plugin.mjs)
 * copy their script lists from here, and validate-harness-matrix.mjs asserts
 * that the hooks/run-hook.cmd polyglot allowlists (cmd + bash halves) match
 * RUN_HOOK_CMD_ALLOWLIST. Adding a hook script means editing this file (and,
 * for Cursor, the two allowlist halves in hooks/run-hook.cmd).
 */

/** Runtime hook scripts wired on every host (bash). */
export const HOOK_SCRIPTS = [
  "behavior-feedback.sh",
  "router.sh",
  "grill-prompt.sh",
  "subagent-stance.sh",
  "write-quality-lint.sh",
  "verification-gate.sh",
  "anti-patterns-lint.sh",
  "comments-lint.sh"
];

/** SessionStart hook shipped to hosts that register one (Codex, Cursor). */
export const SESSION_START_SCRIPT = "session-start.sh";

/** Polyglot Windows entrypoint shipped with the Cursor plugin. */
export const RUN_HOOK_CMD = "run-hook.cmd";

/** Claude-only strict PreToolUse profile (installed via manifest extras). */
export const STRICT_EXTERNAL_ACTIONS_SCRIPT = "strict-external-actions.sh";

/** Scripts that hooks/run-hook.cmd may dispatch; both allowlist halves must match. */
export const RUN_HOOK_CMD_ALLOWLIST = [SESSION_START_SCRIPT, ...HOOK_SCRIPTS];

/** Hook files copied into each plugin bundle (bundles also get hooks/lib + hooks/data). */
export const CODEX_HOOK_FILES = ["hooks.json", ...HOOK_SCRIPTS, SESSION_START_SCRIPT];
export const CURSOR_HOOK_FILES = [SESSION_START_SCRIPT, ...HOOK_SCRIPTS, RUN_HOOK_CMD];
export const OPENCODE_HOOK_SCRIPTS = [...HOOK_SCRIPTS];

/** Source hooks.json each managed install target ships (manifest.json extras). */
export const TARGET_HOOKS_JSON = {
  claude: "hooks/hooks.json",
  codex: "install/codex-hooks.json",
  cursor: "install/cursor-hooks.json"
};

/**
 * Codex plugin hook wiring (official plugin hooks path). Unlike Claude/Cursor,
 * the Codex bundle generates its hooks.json so commands use PLUGIN_ROOT /
 * PLUGIN_DATA, not Claude env only.
 */
/** Codex hook command: prefer PLUGIN_ROOT, then CLAUDE_PLUGIN_ROOT, then `.`
 *  so an empty expansion cannot silently become `/hooks/...`. */
function codexHookCommand(scriptName) {
  return `DO_IT_HOOK_DATA="\${PLUGIN_DATA:-\${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "\${PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT:-.}}/hooks/${scriptName}"`;
}

export function codexHooksJson() {
  return {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command: codexHookCommand("behavior-feedback.sh"),
              timeout: 10
            },
            {
              type: "command",
              command: codexHookCommand("router.sh"),
              timeout: 25
            },
            {
              type: "command",
              command: codexHookCommand("grill-prompt.sh"),
              timeout: 25
            },
            {
              type: "command",
              command: codexHookCommand("subagent-stance.sh"),
              timeout: 10
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: "Edit|Write|MultiEdit|NotebookEdit",
          hooks: [
            {
              type: "command",
              command: codexHookCommand("write-quality-lint.sh"),
              timeout: 15
            }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: codexHookCommand("verification-gate.sh"),
              timeout: 25
            }
          ]
        }
      ]
    }
  };
}
