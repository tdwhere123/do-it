#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rewritePluginReferenceLinks } from "./lib/rewrite-plugin-ref-links.mjs";
import {
	readJson,
	assertVersionParity,
	copyHookScripts,
} from "./lib/plugin-build.mjs";
import { OPENCODE_HOOK_SCRIPTS } from "./lib/hook-manifest.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = readJson(path.join(repoRoot, "manifest.json"));
const pkg = readJson(path.join(repoRoot, "package.json"));

const pluginRoot = path.join(repoRoot, "plugins", "do-it-pi");
const skillsSource = path.join(repoRoot, "skills", "do-it");
const agentsSource = path.join(repoRoot, "dist", "claude", "agents");
const hooksSource = path.join(repoRoot, "hooks");

/** Same advisory hook set as OpenCode (no session-start / run-hook.cmd). */
const PI_HOOK_SCRIPTS = [...OPENCODE_HOOK_SCRIPTS];
const PORTABLE_AGENT_TOOLS = new Set([
	"read",
	"bash",
	"edit",
	"write",
	"intercom",
]);
const PACKAGE_AGENT_NAMESPACE = "do-it";
const FORBIDDEN_AGENT_BUDGETS = [
	"turnBudget",
	"toolBudget",
	"timeoutMs",
	"output",
];

function frontmatter(text, filePath) {
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match)
		throw new Error(
			`Pi agent has no YAML frontmatter: ${path.relative(repoRoot, filePath)}`,
		);
	const values = new Map();
	for (const line of match[1].split(/\r?\n/)) {
		const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
		if (entry) values.set(entry[1], entry[2].trim());
	}
	return values;
}

function assertPiPackageContract(pluginPkg) {
	const extensions = pluginPkg.pi?.extensions ?? [];
	if (extensions.length !== 1 || extensions[0] !== "./extensions/index.ts") {
		throw new Error("plugins/do-it-pi must expose only ./extensions/index.ts");
	}
	const agentDirs = pluginPkg.pi?.subagents?.agents ?? [];
	if (!agentDirs.includes("./agents")) {
		throw new Error(
			"plugins/do-it-pi must expose ./agents through pi.subagents.agents",
		);
	}
	if (pluginPkg.peerDependenciesMeta?.["pi-subagents"]?.optional !== true) {
		throw new Error(
			"plugins/do-it-pi must declare pi-subagents as an optional peer",
		);
	}
	if (pluginPkg.engines?.node !== ">=22.19.0") {
		throw new Error(
			"plugins/do-it-pi Node engine must match Pi 0.81.x (>=22.19.0)",
		);
	}
}

function assertPortableAgents(agentsDir) {
	const names = new Set();
	for (const name of fs
		.readdirSync(agentsDir)
		.filter((entry) => entry.endsWith(".md"))) {
		const filePath = path.join(agentsDir, name);
		const values = frontmatter(fs.readFileSync(filePath, "utf8"), filePath);
		const localName = values.get("name");
		if (!localName)
			throw new Error(
				`Pi agent has no name: ${path.relative(repoRoot, filePath)}`,
			);
		const qualifiedName = `${values.get("package")}.${localName}`;
		if (values.get("package") !== PACKAGE_AGENT_NAMESPACE) {
			throw new Error(
				`Pi package agent must use package: ${PACKAGE_AGENT_NAMESPACE}: ${name}`,
			);
		}
		if (names.has(qualifiedName))
			throw new Error(`duplicate Pi package agent: ${qualifiedName}`);
		names.add(qualifiedName);

		const tools = (values.get("tools") ?? "")
			.split(",")
			.map((tool) => tool.trim())
			.filter(Boolean);
		const unsupported = tools.filter((tool) => !PORTABLE_AGENT_TOOLS.has(tool));
		if (unsupported.length > 0) {
			throw new Error(
				`Pi package agent ${qualifiedName} uses non-portable tools: ${unsupported.join(", ")}`,
			);
		}
		for (const key of FORBIDDEN_AGENT_BUDGETS) {
			if (values.has(key))
				throw new Error(
					`Pi package agent ${qualifiedName} must not set ${key}`,
				);
		}
		if (
			values.get("acceptanceRole") === "read-only" &&
			values.get("completionGuard") !== "false"
		) {
			throw new Error(
				`read-only Pi package agent ${qualifiedName} must disable the mutation completion guard`,
			);
		}
	}

	if (!names.has("do-it.code-mapper")) {
		throw new Error("Pi package agents must include do-it.code-mapper");
	}
}

function assertPiVersionParity() {
	assertVersionParity(manifest, pkg);
	const pluginPkg = readJson(path.join(pluginRoot, "package.json"));
	if (pluginPkg.version !== pkg.version) {
		throw new Error(
			`plugins/do-it-pi version ${pluginPkg.version} does not match root package version ${pkg.version}`,
		);
	}
	assertPiPackageContract(pluginPkg);
}

function copySkills() {
	if (!fs.existsSync(skillsSource)) {
		throw new Error(
			`skills source missing: ${path.relative(repoRoot, skillsSource)}`,
		);
	}

	const targetDir = path.join(pluginRoot, "skills");
	fs.rmSync(targetDir, { recursive: true, force: true });
	fs.cpSync(skillsSource, targetDir, { recursive: true });
	rewritePluginReferenceLinks(path.join(targetDir, "references"), {
		hasHooksJson: false,
	});

	const hostPiSource = path.join(skillsSource, "references", "host-pi.md");
	for (const target of [
		path.join(pluginRoot, "README.md"),
		path.join(pluginRoot, "docs", "README.pi.md"),
		path.join(pluginRoot, "docs", "host-pi.md"),
	]) {
		fs.copyFileSync(hostPiSource, target);
	}

	// Pi discovers SKILL.md files natively. Do not add Claude's generated
	// _index.md here: Pi would parse it as a malformed skill before exclusions.
}

function copyAgents() {
	// Pi package agents are host-specific portable baselines. Local user agents
	// may add richer providers, but published agents must remain install-safe.
	const agentsDir = path.join(pluginRoot, "agents");
	if (!fs.existsSync(agentsDir)) {
		throw new Error(
			`Pi agents missing at ${path.relative(repoRoot, agentsDir)} — maintain host-specific agents there`,
		);
	}
	const agentCount = fs
		.readdirSync(agentsDir)
		.filter((name) => name.endsWith(".md")).length;
	if (agentCount === 0) {
		throw new Error(
			`no Pi agent markdown under ${path.relative(repoRoot, agentsDir)}`,
		);
	}
	assertPortableAgents(agentsDir);
	// Keep agentsSource referenced so generated Claude agents still run when needed elsewhere.
	if (!fs.existsSync(agentsSource)) {
		const gen = spawnSync("npm", ["run", "build:generated"], {
			cwd: repoRoot,
			encoding: "utf8",
			shell: true,
		});
		if (gen.status !== 0) {
			throw new Error(`build:generated failed: ${gen.stderr || gen.stdout}`);
		}
	}
}

function copyHooks() {
	copyHookScripts({
		repoRoot,
		hooksSource,
		targetDir: path.join(pluginRoot, "hooks"),
		scripts: PI_HOOK_SCRIPTS,
	});
}

function main() {
	assertPiVersionParity();
	copySkills();
	copyAgents();
	copyHooks();

	const skillDirs = fs
		.readdirSync(path.join(pluginRoot, "skills"), { withFileTypes: true })
		.filter((e) => e.isDirectory()).length;
	const agentCount = fs
		.readdirSync(path.join(pluginRoot, "agents"))
		.filter((name) => name.endsWith(".md")).length;

	console.log(
		`built Pi plugin -> ${path.relative(repoRoot, pluginRoot)} ` +
			`(${skillDirs} skill dirs, ${agentCount} agents, ${PI_HOOK_SCRIPTS.length} hook scripts)`,
	);
}

main();
