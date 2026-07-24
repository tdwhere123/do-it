import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildPiInvocation } from "../../scripts/install-pi-global.mjs";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);
const pluginRoot = path.join(repoRoot, "plugins", "do-it-pi");
const manifest = JSON.parse(
	fs.readFileSync(path.join(pluginRoot, "package.json"), "utf8"),
);
const portableTools = new Set(["read", "bash", "edit", "write", "intercom"]);

function parseFrontmatter(filePath) {
	const text = fs.readFileSync(filePath, "utf8");
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	assert.ok(match, `${path.basename(filePath)} must have frontmatter`);
	const values = new Map();
	for (const line of match[1].split(/\r?\n/)) {
		const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
		if (entry) values.set(entry[1], entry[2].trim());
	}
	return { text, values };
}

test("Pi installer bypasses the Windows cmd shell and preserves arguments", () => {
	const shimDir = String.raw`C:\Users\First Last & Co\project\node_modules\.bin`;
	const entrypoint = path.win32.resolve(
		shimDir,
		"..",
		"@earendil-works",
		"pi-coding-agent",
		"dist",
		"cli.js",
	);
	const shim = path.win32.join(shimDir, "pi.cmd");
	const installPath = String.raw`C:\Users\First Last & Co\do-it\plugins\do-it-pi`;
	const existing = new Set([shim, entrypoint]);
	const invocation = buildPiInvocation(
		installPath,
		"win32",
		{ Path: `"${shimDir}"` },
		(candidate) => existing.has(candidate),
	);
	assert.equal(invocation.command, process.execPath);
	assert.deepEqual(invocation.args, [entrypoint, "install", installPath]);
	assert.equal("shell" in invocation, false);
	assert.deepEqual(buildPiInvocation("/tmp/do-it pi", "linux"), {
		command: "pi",
		args: ["install", "/tmp/do-it pi"],
	});
});

test("Pi package README surfaces stay generated from the canonical host sheet", () => {
	const canonical = fs.readFileSync(
		path.join(repoRoot, "skills", "do-it", "references", "host-pi.md"),
		"utf8",
	);
	for (const relativePath of [
		"README.md",
		path.join("docs", "README.pi.md"),
		path.join("docs", "host-pi.md"),
	]) {
		assert.equal(
			fs.readFileSync(path.join(pluginRoot, relativePath), "utf8"),
			canonical,
			`${relativePath} drifted from canonical host-pi.md`,
		);
	}
});

test("Pi package exposes one extension and optional namespaced subagents", () => {
	assert.equal(manifest.name, "@tdwhere/do-it-pi");
	assert.deepEqual(manifest.pi.extensions, ["./extensions/index.ts"]);
	assert.deepEqual(manifest.pi.skills, ["./skills"]);
	assert.deepEqual(manifest.pi.subagents.agents, ["./agents"]);
	assert.deepEqual(manifest.pi.prompts, ["./agents"]);
	assert.equal(manifest.peerDependenciesMeta["pi-subagents"].optional, true);
	assert.equal(manifest.engines.node, ">=22.19.0");
	assert.equal(manifest.publishConfig.access, "public");
	assert.equal(
		fs.existsSync(
			path.join(pluginRoot, "extensions", "enable-fff-multigrep.ts"),
		),
		false,
	);
});

test("published agent definitions are portable, namespaced, and budget-free", () => {
	const agentDir = path.join(pluginRoot, "agents");
	const files = fs
		.readdirSync(agentDir)
		.filter((name) => name.endsWith(".md"))
		.sort();
	assert.equal(files.length, 10);

	const qualifiedNames = new Set();
	for (const file of files) {
		const { text, values } = parseFrontmatter(path.join(agentDir, file));
		assert.equal(values.get("package"), "do-it", `${file}: package namespace`);
		const qualifiedName = `do-it.${values.get("name")}`;
		assert.equal(
			qualifiedNames.has(qualifiedName),
			false,
			`${file}: duplicate name`,
		);
		qualifiedNames.add(qualifiedName);

		const tools = (values.get("tools") ?? "")
			.split(",")
			.map((tool) => tool.trim())
			.filter(Boolean);
		assert.deepEqual(
			tools.filter((tool) => !portableTools.has(tool)),
			[],
			`${file}: non-portable tools`,
		);
		for (const key of ["turnBudget", "toolBudget", "timeoutMs", "output"]) {
			assert.equal(
				values.has(key),
				false,
				`${file}: package agent must not set ${key}`,
			);
		}
		if (values.get("acceptanceRole") === "read-only") {
			assert.equal(
				values.get("completionGuard"),
				"false",
				`${file}: read-only guard`,
			);
			assert.equal(
				tools.includes("edit") || tools.includes("write"),
				false,
				`${file}: write tools`,
			);
		}
		assert.doesNotMatch(text, /fff-multi-grep|mcp:codegraph|module_report/);
	}

	assert.equal(qualifiedNames.has("do-it.code-mapper"), true);
});

test("pi-subagents discovers the configured package under do-it.* names", () => {
	const sourcePath = path.join(
		pluginRoot,
		"node_modules",
		"pi-subagents",
		"src",
		"agents",
		"agents.ts",
	);
	assert.equal(
		fs.existsSync(sourcePath),
		true,
		"npm ci --prefix plugins/do-it-pi must install pi-subagents",
	);

	const tempHome = fs.mkdtempSync(
		path.join(os.tmpdir(), "do-it-pi-discovery-"),
	);
	const agentDir = path.join(tempHome, ".pi", "agent");
	fs.mkdirSync(agentDir, { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "settings.json"),
		`${JSON.stringify({ packages: [pluginRoot] }, null, 2)}\n`,
	);
	try {
		const require = createRequire(import.meta.url);
		const jitiUrl = pathToFileURL(
			require.resolve("jiti", { paths: [pluginRoot] }),
		).href;
		const script = `
			import { createJiti } from ${JSON.stringify(jitiUrl)};
			const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
			const { discoverAgentsAll } = await jiti.import(${JSON.stringify(sourcePath)});
			const result = discoverAgentsAll(${JSON.stringify(repoRoot)});
			console.log(JSON.stringify(result.package.map((agent) => agent.name).sort()));
		`;
		const discovered = spawnSync(
			process.execPath,
			["--input-type=module", "--eval", script],
			{
				cwd: repoRoot,
				encoding: "utf8",
				env: {
					...process.env,
					HOME: tempHome,
					PI_CODING_AGENT_DIR: agentDir,
					PI_OFFLINE: "1",
					NODE_NO_WARNINGS: "1",
				},
			},
		);
		assert.equal(discovered.status, 0, discovered.stderr || discovered.stdout);
		const names = JSON.parse(discovered.stdout.trim());
		assert.equal(names.length, 10);
		assert.equal(names.includes("do-it.code-mapper"), true);
		assert.equal(
			names.every((name) => name.startsWith("do-it.")),
			true,
		);
	} finally {
		fs.rmSync(tempHome, { recursive: true, force: true });
	}
});

test("independent npm tarball contains Pi runtime assets only", () => {
	const npmArgs = ["pack", "--dry-run", "--json", "--ignore-scripts"];
	const npmExecPath = process.env.npm_execpath;
	const packed = spawnSync(
		npmExecPath ? process.execPath : "npm",
		npmExecPath ? [npmExecPath, ...npmArgs] : npmArgs,
		{
			cwd: pluginRoot,
			encoding: "utf8",
		},
	);
	assert.equal(packed.status, 0, packed.stderr || packed.stdout);
	const report = JSON.parse(packed.stdout);
	const files = new Set(report[0].files.map((entry) => entry.path));

	for (const required of [
		"package.json",
		"LICENSE",
		"README.md",
		"extensions/index.ts",
		"extensions/bridge.ts",
		"hooks/router.sh",
		"hooks/subagent-stance.sh",
		"skills/do-it-router/SKILL.md",
		"agents/code-mapper.md",
		"docs/README.pi.md",
	]) {
		assert.equal(
			files.has(required),
			true,
			`missing from tarball: ${required}`,
		);
	}
	for (const entry of files) {
		assert.doesNotMatch(
			entry,
			/(?:^|\/)node_modules(?:\/|$)|\.test-dist|skills\/_index\.md|enable-fff-multigrep/,
		);
	}
});
