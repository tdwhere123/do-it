#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it");
const pluginManifestDir = path.join(pluginRoot, ".codex-plugin");
const marketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (current === content) return false;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.do-it-${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, content);
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  return true;
}

function assertVersionParity() {
  if (manifest.version !== pkg.version) {
    throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
  }
}

function basenameFromTarget(target, expectedPrefix) {
  const prefix = `${expectedPrefix}/`;
  if (!target.startsWith(prefix)) {
    throw new Error(`Expected ${target} to start with ${prefix}`);
  }
  const name = target.slice(prefix.length);
  if (!name || name.includes("/") || name.startsWith(".")) {
    throw new Error(`Unsafe generated plugin target: ${target}`);
  }
  return name;
}

function copyManagedDir(entries, kind) {
  const targetDir = path.join(pluginRoot, kind === "skill" ? "skills" : "agents");
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    const sourcePath = path.join(repoRoot, entry.source);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Manifest source missing for ${entry.name}: ${entry.source}`);
    }

    const targetName = kind === "skill"
      ? basenameFromTarget(entry.target, "skills")
      : basenameFromTarget(entry.target, "agents");
    const targetPath = path.join(targetDir, targetName);
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function buildPluginManifest() {
  return {
    name: "do-it",
    version: pkg.version,
    description: pkg.description,
    author: {
      name: pkg.author
    },
    homepage: pkg.homepage,
    repository: pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ?? "https://github.com/tdwhere123/do-it",
    license: pkg.license,
    keywords: [
      "codex",
      "workflow",
      "skills",
      "agents",
      "subagents",
      "verification",
      "do-it"
    ],
    skills: "./skills/",
    agents: "./agents/",
    hooks: "./hooks/hooks.json",
    interface: {
      displayName: "do-it",
      shortDescription: "Autonomy-first workflow discipline for Codex.",
      longDescription:
        "Install do-it via the Codex plugin marketplace. Skills and bundled agents are selected only when task-fit helps; plugin hooks provide compact routing and evidence reminders. Trust plugin hooks in /hooks after install.",
      developerName: "tdwhere123",
      category: "Coding",
      capabilities: ["Skills", "Agents", "Hooks"],
      websiteURL: "https://github.com/tdwhere123/do-it",
      defaultPrompt: [
        "Work autonomously: choose do-it skills or bundled agents only when task-fit helps; honor direct user intent, keep external/destructive actions confirmed, and report task-relevant evidence."
      ],
      brandColor: "#2563EB"
    }
  };
}

function buildMarketplace() {
  return {
    name: "tdwhere-do-it",
    interface: {
      displayName: "do-it workflow"
    },
    plugins: [
      {
        name: "do-it",
        source: {
          source: "local",
          path: "./plugins/do-it"
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Coding"
      }
    ]
  };
}

function main() {
  assertVersionParity();

  const skills = manifest.skills ?? [];
  const agents = manifest.agents ?? [];
  const optionalSkills = skills.filter((entry) => entry.optional).map((entry) => entry.name);

  fs.mkdirSync(pluginManifestDir, { recursive: true });
  copyManagedDir(skills, "skill");
  copyManagedDir(agents, "agent");

  const refsSource = path.join(repoRoot, "skills", "do-it", "references");
  if (!fs.existsSync(refsSource)) {
    throw new Error(`references missing: ${path.relative(repoRoot, refsSource)}`);
  }
  fs.cpSync(refsSource, path.join(pluginRoot, "skills", "references"), { recursive: true });
  rewritePluginReferenceLinks(path.join(pluginRoot, "skills", "references"));

  // Plugin-bundled hooks (official Codex plugin hooks path).
  const hooksSource = path.join(repoRoot, "hooks");
  const hooksTarget = path.join(pluginRoot, "hooks");
  fs.rmSync(hooksTarget, { recursive: true, force: true });
  fs.mkdirSync(hooksTarget, { recursive: true });
  for (const name of [
    "hooks.json",
    "behavior-feedback.sh",
    "router.sh",
    "grill-prompt.sh",
    "subagent-stance.sh",
    "write-quality-lint.sh",
    "verification-gate.sh",
    "anti-patterns-lint.sh",
    "comments-lint.sh",
    "session-start.sh"
  ]) {
    const src = path.join(hooksSource, name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(hooksTarget, name));
  }
  fs.cpSync(path.join(hooksSource, "lib"), path.join(hooksTarget, "lib"), { recursive: true });
  fs.cpSync(path.join(hooksSource, "data"), path.join(hooksTarget, "data"), { recursive: true });

  // Codex plugin hooks should use PLUGIN_ROOT / PLUGIN_DATA, not Claude env only.
  const pluginHooksJson = {
    hooks: {
      UserPromptSubmit: [
        {
          hooks: [
            {
              type: "command",
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/behavior-feedback.sh"',
              timeout: 10
            },
            {
              type: "command",
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/router.sh"',
              timeout: 25
            },
            {
              type: "command",
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/grill-prompt.sh"',
              timeout: 25
            },
            {
              type: "command",
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/subagent-stance.sh"',
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
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/write-quality-lint.sh"',
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
              command:
                'DO_IT_HOOK_DATA="${PLUGIN_DATA:-${CLAUDE_PLUGIN_DATA:-/tmp/do-it-data}}" "${PLUGIN_ROOT:-$CLAUDE_PLUGIN_ROOT}/hooks/verification-gate.sh"',
              timeout: 25
            }
          ]
        }
      ]
    }
  };
  writeJsonAtomic(path.join(hooksTarget, "hooks.json"), pluginHooksJson);

  writeJsonAtomic(path.join(pluginManifestDir, "plugin.json"), buildPluginManifest());
  writeJsonAtomic(marketplacePath, buildMarketplace());

  console.log(
    `built Codex plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
      `(${skills.length} skills, ${agents.length} agents, hooks: yes, optional: ${optionalSkills.join(", ") || "none"})`
  );
}

main();
