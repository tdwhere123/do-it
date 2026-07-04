# AGENTS.md

## Cursor Cloud specific instructions

`do-it` is a dependency-free Node.js CLI/plugin package (`bin/do-it.mjs`). The
root `package.json` has **no runtime dependencies**; there is intentionally no
root lockfile, so do not run `npm ci` at the repo root (it will fail).

- **System prerequisites:** `npm run lint` needs `shellcheck` (>= 0.9) and the
  hook tests use `jq`. Both are provided by the VM snapshot; if `shellcheck` is
  ever missing, install with `sudo apt-get install -y shellcheck`.
- **OpenCode sub-package:** `plugins/do-it-opencode/` is a separate npm package
  with its own lockfile. Its `typescript` devDependency is required for
  `npm run build:opencode-plugin` and therefore for `npm test` (which runs the
  OpenCode build). The startup update script installs these deps; without them
  the build fails with "TypeScript compilation is required".
- **Lint / test / build:** use the `package.json` scripts — `npm run lint`
  (shellcheck), `npm test` (generated-agent build, schema validation, hook
  regression suite, install + OpenCode tests). `npm test` regenerates
  `dist/claude/`, `plugins/do-it-cursor/`, `.cursor-plugin/`, `.agents/plugins`,
  and `index.json`; CI enforces these stay committed (`git diff --exit-code`).
  If those files show a diff after a build, it means a source change needs the
  generated output re-committed — do not leave the diff uncommitted.
- **Running the app:** the CLI installs the workflow into a host directory.
  Always point it at a throwaway directory so you never touch a real host
  config: `CODEX_HOME=/tmp/do-it-test node bin/do-it.mjs setup`
  (or `--target=claude` with `CLAUDE_PLUGIN_ROOT_OVERRIDE`, `--target=cursor`
  with `CURSOR_PLUGIN_ROOT_OVERRIDE`). `setup` runs `install` then `doctor`.
