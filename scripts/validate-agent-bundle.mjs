#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const allowedAgentKeys = new Set([
  "name",
  "description",
  "model",
  "model_reasoning_effort",
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
  }
}

function validateGeneratedSkills(manifest, errors) {
  const skills = manifest.skills ?? [];
  const expectedSkillTargets = skills.map((skill) => basenameFromTarget(skill.target, "skills")).sort();
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
}

function main() {
  const pkg = readJson("package.json");
  const manifest = readJson("manifest.json");
  const errors = [];

  validateVersions(pkg, manifest, errors);
  const sourceNames = validateSourceAgents(manifest, errors);
  validateGeneratedAgents(sourceNames, errors);
  validateGeneratedSkills(manifest, errors);

  if (errors.length > 0) {
    console.error(`validate-agent-bundle: ${errors.length} failure(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(`validated ${sourceNames.length} Codex agent TOML files and generated plugin inventory`);
}

main();
