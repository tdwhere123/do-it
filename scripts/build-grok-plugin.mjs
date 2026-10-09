#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_SKILLS } from "./skill-tiers.mjs";
import { GROK_HOOK_FILES } from "./lib/hook-manifest.mjs";
import { parseAgentToml } from "./lib/agent-source.mjs";
import { readJson, writeJsonAtomic, assertVersionParity, copyHookScripts } from "./lib/plugin-build.mjs";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(repoRoot, "plugins/do-it-grok");
const pkg = readJson(path.join(repoRoot, "package.json"));
assertVersionParity(readJson(path.join(repoRoot, "manifest.json")), pkg);

const skillsDir = path.join(pluginRoot, "skills");
fs.rmSync(skillsDir, { recursive: true, force: true });
for (const name of [...ALL_SKILLS, "references"]) {
  fs.cpSync(path.join(repoRoot, "skills/do-it", name), path.join(skillsDir, name), { recursive: true });
}
rewritePluginReferenceLinks(path.join(skillsDir, "references"));

const agentsDir = path.join(pluginRoot, "agents");
fs.rmSync(agentsDir, { recursive: true, force: true });
fs.mkdirSync(agentsDir, { recursive: true });
const agentFiles = fs.readdirSync(path.join(repoRoot, "agents")).filter(name => name.endsWith(".toml")).sort();
for (const file of agentFiles) {
  const agent = parseAgentToml(fs.readFileSync(path.join(repoRoot, "agents", file), "utf8"));
  // Grok accepts these fields. Canonical read-only instructions are behavioral;
  // Codex sandbox_mode and Claude disallowedTools are not Grok permissions.
  const text = `---\nname: ${JSON.stringify(agent.name)}\ndescription: ${JSON.stringify(agent.description)}\n---\n\n${agent.developer_instructions.trim()}\n`;
  fs.writeFileSync(path.join(agentsDir, file.replace(/\.toml$/, ".md")), text);
}

copyHookScripts({ repoRoot, hooksSource: path.join(repoRoot, "hooks"),
  targetDir: path.join(pluginRoot, "hooks"), scripts: GROK_HOOK_FILES });
const command = mode => ({ type: "command",
  command: `DO_IT_EVENT_HOST=grok bash "\${GROK_PLUGIN_ROOT}/hooks/grok-adapter.sh" ${mode}`, timeout: 15 });
writeJsonAtomic(path.join(pluginRoot, "hooks/hooks.json"), { hooks: {
  UserPromptSubmit: [{ hooks: [command("user-turn")] }],
  PostToolUse: [
    { hooks: [command("core")] },
    { matcher: "Edit|Write|MultiEdit|search_replace", hooks: [command("write-quality")] }
  ]
} });
writeJsonAtomic(path.join(pluginRoot, ".grok-plugin/plugin.json"), {
  name: "do-it-grok", version: pkg.version, description: pkg.description,
  author: typeof pkg.author === "string" ? { name: pkg.author } : pkg.author,
  license: pkg.license, skills: "./skills", agents: "./agents", hooks: "./hooks/hooks.json"
});
fs.copyFileSync(path.join(repoRoot, "LICENSE"), path.join(pluginRoot, "LICENSE"));
console.log(`built Grok Build plugin -> plugins/do-it-grok (${ALL_SKILLS.length} skills, ${agentFiles.length} agents)`);
