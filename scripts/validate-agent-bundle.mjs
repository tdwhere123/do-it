#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CORE_SKILLS } from "./skill-tiers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const allowedAgentKeys = new Set([
  "name",
  "description",
  "sandbox_mode",
  "developer_instructions"
]);

const requiredAgentKeys = ["name", "description", "developer_instructions"];

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function display(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(repoPath(relativePath), "utf8"));
}

function listNames(relativeDir, extension = null) {
  const dir = repoPath(relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => !extension || name.endsWith(extension))
    .sort();
}

function basenameFromTarget(target, prefix) {
  const expectedPrefix = `${prefix}/`;
  if (!target.startsWith(expectedPrefix)) {
    throw new Error(`Expected ${target} to start with ${expectedPrefix}`);
  }
  const name = target.slice(expectedPrefix.length);
  if (!name || name.includes("/") || name.startsWith(".")) {
    throw new Error(`Unsafe target path: ${target}`);
  }
  return name;
}

function parseTomlTopLevelKeys(source, filePath) {
  const keys = new Map();
  const lines = source.split(/\r?\n/);
  let inMultilineString = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (inMultilineString) {
      if (trimmed.includes('"""')) inMultilineString = false;
      continue;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      throw new Error(`${display(filePath)}:${index + 1}: cannot parse top-level TOML key`);
    }

    keys.set(match[1], index + 1);
    const valueStart = match[2].trimStart();
    if (valueStart.startsWith('"""') && valueStart.indexOf('"""', 3) === -1) {
      inMultilineString = true;
    }
  }

  return keys;
}

function readTomlStringValue(source, key) {
  const match = new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(source);
  return match?.[1] ?? null;
}

function validatePortableAgentPolicy(relativePath, content, errors) {
  const concreteModelPattern = /\b(?:gpt-[A-Za-z0-9_.-]+|sonnet|opus|haiku)\b/i;
  const hostPrivatePattern = /\b(?:model_reasoning_effort|claude_model|output_budget)\b/;

  if (concreteModelPattern.test(content)) {
    errors.push(`${relativePath}: must not pin concrete model names; model selection is host-owned`);
  }
  if (hostPrivatePattern.test(content)) {
    errors.push(`${relativePath}: must not contain host-private model or budget fields`);
  }
}

function sameFile(leftPath, rightPath) {
  return fs.readFileSync(leftPath).equals(fs.readFileSync(rightPath));
}

function collectTreeFiles(rootPath) {
  const stat = fs.lstatSync(rootPath);
  if (!stat.isDirectory()) return [""];

  const results = [];
  function visit(currentPath, relativePath) {
    const currentStat = fs.lstatSync(currentPath);
    if (currentStat.isDirectory()) {
      for (const child of fs.readdirSync(currentPath).sort()) {
        const childRelative = relativePath ? `${relativePath}/${child}` : child;
        visit(path.join(currentPath, child), childRelative);
      }
      return;
    }
    results.push(relativePath);
  }
  visit(rootPath, "");
  return results;
}

function pathsMatch(leftPath, rightPath) {
  if (!fs.existsSync(leftPath) || !fs.existsSync(rightPath)) return false;
  const leftStat = fs.lstatSync(leftPath);
  const rightStat = fs.lstatSync(rightPath);
  if (leftStat.isDirectory() !== rightStat.isDirectory()) return false;
  if (!leftStat.isDirectory()) return sameFile(leftPath, rightPath);

  const leftFiles = collectTreeFiles(leftPath);
  const rightFiles = collectTreeFiles(rightPath);
  if (leftFiles.join("\n") !== rightFiles.join("\n")) return false;

  return leftFiles.every((relativeFile) =>
    sameFile(path.join(leftPath, relativeFile), path.join(rightPath, relativeFile))
  );
}

function compareSets(label, expected, actual, errors) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  for (const name of expected) {
    if (!actualSet.has(name)) errors.push(`${label}: missing ${name}`);
  }
  for (const name of actual) {
    if (!expectedSet.has(name)) errors.push(`${label}: unexpected ${name}`);
  }
}

function validateVersions(pkg, manifest, errors) {
  if (pkg.version !== manifest.version) {
    errors.push(`package.json version ${pkg.version} does not match manifest.json ${manifest.version}`);
  }

  const codexPlugin = readJson("plugins/do-it/.codex-plugin/plugin.json");
  if (codexPlugin.version !== pkg.version) {
    errors.push(`plugins/do-it/.codex-plugin/plugin.json version ${codexPlugin.version} does not match package.json ${pkg.version}`);
  }

  const claudePlugin = readJson(".claude-plugin/plugin.json");
  if (claudePlugin.version !== pkg.version) {
    errors.push(`.claude-plugin/plugin.json version ${claudePlugin.version} does not match package.json ${pkg.version}`);
  }

  const claudeMarketplace = readJson(".claude-plugin/marketplace.json");
  const claudeMarketplaceVersion = claudeMarketplace.plugins?.find((plugin) => plugin.name === "do-it")?.version;
  if (claudeMarketplaceVersion !== pkg.version) {
    errors.push(`.claude-plugin/marketplace.json plugin version ${claudeMarketplaceVersion ?? "<missing>"} does not match package.json ${pkg.version}`);
  }
}

function validateSourceAgents(manifest, errors) {
  const sourceFiles = listNames("agents", ".toml");
  const sourceNames = sourceFiles.map((file) => file.replace(/\.toml$/, ""));

  const manifestAgents = manifest.agents ?? [];
  const manifestNames = manifestAgents.map((agent) => agent.name).sort();
  compareSets("manifest.agents", sourceNames, manifestNames, errors);

  for (const fileName of sourceFiles) {
    const filePath = repoPath(`agents/${fileName}`);
    const source = fs.readFileSync(filePath, "utf8");
    validatePortableAgentPolicy(`agents/${fileName}`, source, errors);
    const keys = parseTomlTopLevelKeys(source, filePath);
    const agentName = readTomlStringValue(source, "name");
    const expectedName = fileName.replace(/\.toml$/, "");

    if (agentName !== expectedName) {
      errors.push(`${display(filePath)}: name ${agentName ?? "<missing>"} does not match filename ${expectedName}`);
    }

    for (const requiredKey of requiredAgentKeys) {
      if (!keys.has(requiredKey)) {
        errors.push(`${display(filePath)}: missing required key ${requiredKey}`);
      }
    }

    for (const [key, line] of keys) {
      if (!allowedAgentKeys.has(key)) {
        errors.push(`${display(filePath)}:${line}: unsupported Codex agent key ${key}`);
      }
    }
  }

  for (const agent of manifestAgents) {
    const expectedPath = `agents/${agent.name}.toml`;
    if (agent.source !== expectedPath || agent.target !== expectedPath) {
      errors.push(`manifest.agents ${agent.name}: expected source and target ${expectedPath}`);
    }
  }

  return sourceNames.sort();
}

function validateGeneratedAgents(sourceNames, errors) {
  const pluginAgentFiles = listNames("plugins/do-it/agents", ".toml");
  const pluginAgentNames = pluginAgentFiles.map((file) => file.replace(/\.toml$/, ""));
  compareSets("plugins/do-it/agents", sourceNames, pluginAgentNames, errors);

  for (const name of sourceNames) {
    const sourcePath = repoPath(`agents/${name}.toml`);
    const pluginPath = repoPath(`plugins/do-it/agents/${name}.toml`);
    if (!fs.existsSync(pluginPath)) continue;
    if (!sameFile(sourcePath, pluginPath)) {
      errors.push(`plugins/do-it/agents/${name}.toml is not byte-equal to agents/${name}.toml`);
    }
  }

  const claudeAgentFiles = listNames("dist/claude/agents", ".md");
  const claudeAgentNames = claudeAgentFiles.map((file) => file.replace(/\.md$/, ""));
  compareSets("dist/claude/agents", sourceNames, claudeAgentNames, errors);

  for (const name of sourceNames) {
    const claudePath = repoPath(`dist/claude/agents/${name}.md`);
    if (!fs.existsSync(claudePath)) continue;
    const content = fs.readFileSync(claudePath, "utf8");
    if (!content.startsWith("---\n")) {
      errors.push(`dist/claude/agents/${name}.md missing frontmatter`);
    }
    if (!content.includes(`\nname: ${name}\n`)) {
      errors.push(`dist/claude/agents/${name}.md frontmatter name mismatch`);
    }
    if (content.includes("\nmodel:")) {
      errors.push(`dist/claude/agents/${name}.md must inherit the host model; omit model frontmatter`);
    }
    validatePortableAgentPolicy(`dist/claude/agents/${name}.md`, content, errors);
  }
}

function validateGeneratedSkills(manifest, errors) {
  const skills = manifest.skills ?? [];
  const expectedSkillTargets = [
    ...skills.map((skill) => basenameFromTarget(skill.target, "skills")),
    "references"
  ].sort();
  const actualSkillTargets = listNames("plugins/do-it/skills").sort();
  compareSets("plugins/do-it/skills", expectedSkillTargets, actualSkillTargets, errors);

  for (const skill of skills) {
    const targetName = basenameFromTarget(skill.target, "skills");
    const sourcePath = repoPath(skill.source);
    const pluginPath = repoPath(`plugins/do-it/skills/${targetName}`);
    if (!fs.existsSync(pluginPath)) continue;
    if (!pathsMatch(sourcePath, pluginPath)) {
      errors.push(`plugins/do-it/skills/${targetName} is not generated from ${skill.source}`);
    }
  }

  const refsSource = repoPath("skills/do-it/references");
  const refsPlugin = repoPath("plugins/do-it/skills/references");
  if (fs.existsSync(refsPlugin) && !pathsMatch(refsSource, refsPlugin)) {
    errors.push("plugins/do-it/skills/references is not generated from skills/do-it/references");
  }
}

function validateIndexJson(pkg, manifest, errors) {
  if (!pkg.files?.includes("index.json")) {
    errors.push("package.json files[] must include index.json");
  }

  const indexPath = repoPath("index.json");
  if (!fs.existsSync(indexPath)) {
    errors.push("index.json is missing; run npm run build:generated");
    return;
  }

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (error) {
    errors.push(`index.json is not readable JSON: ${error.message}`);
    return;
  }

  if (index.version !== manifest.version) {
    errors.push(`index.json version ${index.version ?? "<missing>"} does not match manifest ${manifest.version}`);
  }
  if (index.package !== pkg.name) {
    errors.push(`index.json package ${index.package ?? "<missing>"} does not match package.json ${pkg.name}`);
  }
  if (index.total_skills !== (manifest.skills ?? []).length) {
    errors.push(`index.json total_skills ${index.total_skills ?? "<missing>"} does not match manifest skills`);
  }
  if (index.total_agents !== (manifest.agents ?? []).length) {
    errors.push(`index.json total_agents ${index.total_agents ?? "<missing>"} does not match manifest agents`);
  }

  const entries = Array.isArray(index.entries) ? index.entries : [];
  if (!Array.isArray(index.entries)) {
    errors.push("index.json entries must be an array");
  }
  const expectedEntryCount = (manifest.skills ?? []).length + (manifest.agents ?? []).length;
  if (entries.length !== expectedEntryCount) {
    errors.push(`index.json entries length ${entries.length} does not match manifest total ${expectedEntryCount}`);
  }

  const indexed = new Map(entries.map((entry) => [`${entry.kind}:${entry.name}`, entry]));
  for (const skill of manifest.skills ?? []) {
    const entry = indexed.get(`skill:${skill.name}`);
    if (!entry) {
      errors.push(`index.json missing skill:${skill.name}`);
      continue;
    }
    if (entry.source !== skill.source || entry.target !== skill.target) {
      errors.push(`index.json skill:${skill.name} source/target drift`);
    }
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      errors.push(`index.json skill:${skill.name} description missing`);
    }
  }

  for (const agent of manifest.agents ?? []) {
    const entry = indexed.get(`agent:${agent.name}`);
    if (!entry) {
      errors.push(`index.json missing agent:${agent.name}`);
      continue;
    }
    if (entry.source !== agent.source || entry.target !== agent.target) {
      errors.push(`index.json agent:${agent.name} source/target drift`);
    }
    if (typeof entry.description !== "string" || entry.description.trim() === "") {
      errors.push(`index.json agent:${agent.name} description missing`);
    }
  }
}

function validateCursorPlugin(pkg, errors) {
  const cursorPluginPath = "plugins/do-it-cursor/.cursor-plugin/plugin.json";
  if (!fs.existsSync(repoPath(cursorPluginPath))) {
    errors.push(
      `${cursorPluginPath} is missing; run npm run build:cursor-plugin before validate:agents`
    );
    return;
  }

  const cursorPlugin = readJson(cursorPluginPath);
  if (cursorPlugin.version !== pkg.version) {
    errors.push(
      `${cursorPluginPath} version ${cursorPlugin.version} does not match package.json ${pkg.version}`
    );
  }

  const claudeAgentFiles = listNames("dist/claude/agents", ".md");
  const cursorAgentFiles = listNames("plugins/do-it-cursor/agents", ".md");
  const claudeAgentNames = claudeAgentFiles.map((file) => file.replace(/\.md$/, ""));
  const cursorAgentNames = cursorAgentFiles.map((file) => file.replace(/\.md$/, ""));
  compareSets("plugins/do-it-cursor/agents", claudeAgentNames, cursorAgentNames, errors);

  for (const name of claudeAgentNames) {
    const claudePath = repoPath(`dist/claude/agents/${name}.md`);
    const cursorPath = repoPath(`plugins/do-it-cursor/agents/${name}.md`);
    if (!fs.existsSync(cursorPath)) continue;
    if (!sameFile(claudePath, cursorPath)) {
      errors.push(
        `plugins/do-it-cursor/agents/${name}.md is not byte-equal to dist/claude/agents/${name}.md`
      );
    }
  }

  const allowedSkillDirs = [...CORE_SKILLS, "references"].sort();
  const actualSkillDirs = listNames("plugins/do-it-cursor/skills").sort();
  compareSets("plugins/do-it-cursor/skills", allowedSkillDirs, actualSkillDirs, errors);

  for (const name of CORE_SKILLS) {
    const sourcePath = repoPath(`skills/do-it/${name}`);
    const cursorPath = repoPath(`plugins/do-it-cursor/skills/${name}`);
    if (!fs.existsSync(cursorPath)) continue;
    if (!pathsMatch(sourcePath, cursorPath)) {
      errors.push(
        `plugins/do-it-cursor/skills/${name} is not generated from skills/do-it/${name}`
      );
    }
  }

  const refsSource = repoPath("skills/do-it/references");
  const refsCursor = repoPath("plugins/do-it-cursor/skills/references");
  if (fs.existsSync(refsCursor) && !pathsMatch(refsSource, refsCursor)) {
    errors.push(
      "plugins/do-it-cursor/skills/references is not generated from skills/do-it/references"
    );
  }
}

function main() {
  const pkg = readJson("package.json");
  const manifest = readJson("manifest.json");
  const errors = [];

  validateVersions(pkg, manifest, errors);
  const sourceNames = validateSourceAgents(manifest, errors);
  validateGeneratedAgents(sourceNames, errors);
  validateGeneratedSkills(manifest, errors);
  validateIndexJson(pkg, manifest, errors);
  validateCursorPlugin(pkg, errors);

  if (errors.length > 0) {
    console.error(`validate-agent-bundle: ${errors.length} failure(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `validated ${sourceNames.length} Codex agent TOML files, generated plugin inventory, and Cursor plugin bundle`
  );
}

main();
