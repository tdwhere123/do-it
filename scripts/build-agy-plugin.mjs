#!/usr/bin/env node
/**
 * Build plugins/do-it-agy from canonical skills, agents, references, and hooks.
 * Places references at plugin root (../references from plugin root) so every directory under
 * skills/ is a genuine skill folder for `agy plugin validate --strict`.
 */

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS } from "./skill-tiers.mjs";
import { AGY_HOOK_FILES } from "./lib/hook-manifest.mjs";
import { parseAgentToml } from "./lib/agent-source.mjs";
import { readJson, writeJsonAtomic, assertVersionParity, copyHookScripts } from "./lib/plugin-build.mjs";
import { rewriteReferenceMarkdown } from "./lib/rewrite-plugin-ref-links.mjs";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function toolsLineForSandbox(sandboxMode) {
  if (sandboxMode === "read-only") {
    return "tools: [read_file, run_command, manage_task]";
  }
  if (sandboxMode === "workspace-write") {
    return "tools: [read_file, edit_file, write_file, run_command, manage_task]";
  }
  throw new Error(`unsupported agent sandbox_mode for do-it-agy: ${sandboxMode}`);
}

function rewriteSkillReferenceDepth(skillDir) {
  for (const entry of fs.readdirSync(skillDir, { withFileTypes: true })) {
    const fullPath = path.join(skillDir, entry.name);
    if (entry.isDirectory()) {
      rewriteSkillReferenceDepth(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const before = fs.readFileSync(fullPath, "utf8");
    const after = before.replaceAll("../references/", "../../references/");
    if (after !== before) fs.writeFileSync(fullPath, after);
  }
}

function rewriteAgyReferenceDir(refsDir) {
  for (const name of fs.readdirSync(refsDir)) {
    if (!name.endsWith(".md")) continue;
    const filePath = path.join(refsDir, name);
    const before = fs.readFileSync(filePath, "utf8");
    const rewritten = rewriteReferenceMarkdown(before, { hasHooksJson: false })
      .replaceAll("](../../hooks/", "](../hooks/");
    if (rewritten !== before) fs.writeFileSync(filePath, rewritten);
  }
}

function renderAgyReadme(version) {
  return `# do-it-agy (${version})

Antigravity plugin bundle for **@tdwhere/do-it**.

- **Skills**: 10 canonical engineering skills (\`do-it-core\`, \`do-it-code-quality\`, \`do-it-review\`, \`do-it-decide\`, \`do-it-verify\`, \`do-it-architecture\`, \`do-it-audit\`, \`do-it-retrospective\`, \`do-it-context\`, \`do-it-skill-authoring\`) + \`references/\`.
- **Agents**: 8 model-inheriting subagents with least-privilege AGY tool scopes.
- **Hooks**: \`SessionStart\`, \`PreInvocation\`, \`PostToolUse\` (write quality lint staged per session), and \`PostInvocation\` (injects pending advisories).
`;
}

export function buildAgyPlugin(repoRoot = defaultRepoRoot) {
  const manifest = readJson(path.join(repoRoot, "manifest.json"));
  const pkg = readJson(path.join(repoRoot, "package.json"));
  assertVersionParity(manifest, pkg);

  const pluginsDir = path.join(repoRoot, "plugins");
  const pluginRoot = path.join(pluginsDir, "do-it-agy");
  const stageRoot = path.join(pluginsDir, `.do-it-agy.stage-${process.pid}-${crypto.randomUUID()}`);
  const backupRoot = path.join(pluginsDir, `.do-it-agy.backup-${process.pid}-${crypto.randomUUID()}`);

  fs.mkdirSync(stageRoot, { recursive: true });
  try {
    const skillsDir = path.join(stageRoot, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const name of ALL_SKILLS) {
      const destSkillDir = path.join(skillsDir, name);
      fs.cpSync(path.join(repoRoot, "skills/do-it", name), destSkillDir, { recursive: true });
      rewriteSkillReferenceDepth(destSkillDir);
    }

    const refsDir = path.join(stageRoot, "references");
    fs.cpSync(path.join(repoRoot, "skills/do-it/references"), refsDir, { recursive: true });
    rewriteAgyReferenceDir(refsDir);

    const agentsDir = path.join(stageRoot, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    const agentFiles = fs.readdirSync(path.join(repoRoot, "agents"))
      .filter((name) => name.endsWith(".toml"))
      .sort();
    for (const file of agentFiles) {
      const agent = parseAgentToml(fs.readFileSync(path.join(repoRoot, "agents", file), "utf8"));
      const toolsLine = toolsLineForSandbox(agent.sandbox_mode);
      const body = [
        "---",
        `name: ${agent.name}`,
        `description: ${JSON.stringify(agent.description)}`,
        "subagent: true",
        "mainAgent: false",
        toolsLine,
        "---",
        "",
        agent.developer_instructions.trim(),
        ""
      ].join("\n");
      fs.writeFileSync(path.join(agentsDir, file.replace(/\.toml$/, ".md")), body);
    }

    copyHookScripts({
      repoRoot,
      hooksSource: path.join(repoRoot, "hooks"),
      targetDir: path.join(stageRoot, "hooks"),
      scripts: AGY_HOOK_FILES
    });

    writeJsonAtomic(path.join(stageRoot, "hooks.json"), {
      "do-it": {
        SessionStart: [
          { type: "command", command: "./hooks/agy-adapter.sh session-start", timeout: 15 }
        ],
        PreInvocation: [
          { type: "command", command: "./hooks/agy-adapter.sh pre-invocation", timeout: 15 }
        ],
        PostToolUse: [
          {
            matcher: "write_file|edit_file|replace_file_content|multi_replace_file_content",
            hooks: [
              { type: "command", command: "./hooks/agy-adapter.sh post-tool", timeout: 15 }
            ]
          }
        ],
        PostInvocation: [
          { type: "command", command: "./hooks/agy-adapter.sh post-invocation", timeout: 15 }
        ]
      }
    });

    const homepage = typeof pkg.homepage === "string"
      ? pkg.homepage
      : "https://github.com/tdwhere123/do-it#readme";
    writeJsonAtomic(path.join(stageRoot, "plugin.json"), {
      name: "do-it-agy",
      displayName: "do-it",
      version: pkg.version,
      description: pkg.description,
      author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name ?? "tdwhere123",
      homepage,
      repository: "https://github.com/tdwhere123/do-it"
    });

    fs.copyFileSync(path.join(repoRoot, "LICENSE"), path.join(stageRoot, "LICENSE"));
    fs.writeFileSync(path.join(stageRoot, "README.md"), renderAgyReadme(pkg.version));

    const hadExisting = fs.existsSync(pluginRoot);
    if (hadExisting) fs.renameSync(pluginRoot, backupRoot);
    try {
      fs.renameSync(stageRoot, pluginRoot);
    } catch (error) {
      if (hadExisting && fs.existsSync(backupRoot) && !fs.existsSync(pluginRoot)) {
        fs.renameSync(backupRoot, pluginRoot);
      }
      throw error;
    }
    if (hadExisting) fs.rmSync(backupRoot, { recursive: true, force: true });

    return { skillsCount: ALL_SKILLS.length, agentsCount: agentFiles.length, pluginRoot };
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
    fs.rmSync(backupRoot, { recursive: true, force: true });
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const { skillsCount, agentsCount } = buildAgyPlugin();
  console.log(`built Antigravity plugin -> plugins/do-it-agy (${skillsCount} skills, ${agentsCount} agents)`);
}
