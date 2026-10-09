#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? repoRoot,
		encoding: "utf8",
		env: options.env ?? process.env,
		input: options.input,
		stdio: options.capture ? "pipe" : "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} failed (${result.status})\n${result.stdout ?? ""}${result.stderr ?? ""}`,
		);
	}
	return result;
}

function pack(packageDir, destination) {
	const result = run(
		"npm",
		["pack", "--json", "--ignore-scripts", "--pack-destination", destination],
		{ cwd: packageDir, capture: true },
	);
	const jsonStart = result.stdout.lastIndexOf("\n[");
	const output = JSON.parse(
		jsonStart >= 0 ? result.stdout.slice(jsonStart + 1) : result.stdout,
	);
	assert.equal(output.length, 1, "npm pack should produce exactly one tarball");
	return path.join(destination, output[0].filename);
}

/** Pack the root package, or use one explicitly supplied npm-pack artifact. */
export function resolveSmokeTarballs(argv, packers) {
	const tarballArgs = argv.filter((arg) => arg !== "--keep");
	assert.ok(
		tarballArgs.length <= 1,
		"smoke:package accepts exactly one root package tarball",
	);
	if (tarballArgs.length === 0) {
		return { source: "packed", rootTarball: packers.packRoot() };
	}

	const tarball = path.resolve(tarballArgs[0]);
	assert.match(
		path.basename(tarball),
		/^tdwhere-do-it-\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?\.tgz$/,
		"smoke:package expects a @tdwhere/do-it npm-pack tarball (tdwhere-do-it-X.Y.Z.tgz)",
	);
	assert.ok(fs.existsSync(tarball), `smoke tarball missing: ${tarball}`);
	assert.ok(
		fs.statSync(tarball).isFile(),
		`smoke tarball is not a file: ${tarball}`,
	);
	return { source: "cli", rootTarball: tarball };
}

function assertNoCheckoutDependency(text, checkoutRoot) {
	assert.ok(
		!text.includes(checkoutRoot),
		`command output references checkout: ${checkoutRoot}`,
	);
}

function exercisePackedGrok(packageRoot, tempRoot, version) {
	const grokRoot = path.join(packageRoot, "plugins/do-it-grok");
	const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
	const plugin = readJson(path.join(grokRoot, ".grok-plugin/plugin.json"));
	const inventory = readJson(path.join(packageRoot, "manifest.json"));
	assert.equal(plugin.name, "do-it-grok");
	assert.equal(plugin.version, version);
	for (const name of Object.values(inventory.skillTiers).flat()) {
		assert.ok(fs.existsSync(path.join(grokRoot, plugin.skills, name, "SKILL.md")), `packed Grok skill missing: ${name}`);
	}
	for (const agent of inventory.agents) {
		assert.ok(fs.existsSync(path.join(grokRoot, plugin.agents, `${agent.name}.md`)), `packed Grok agent missing: ${agent.name}`);
	}
	const hooks = readJson(path.join(grokRoot, plugin.hooks)).hooks;
	const env = { ...process.env, HOME: path.join(tempRoot, "home"),
		GROK_PLUGIN_ROOT: grokRoot, GROK_PLUGIN_DATA: path.join(tempRoot, "grok-data") };
	const invoke = (event) => run("bash", ["-c", hooks[event][0].hooks[0].command], {
		cwd: tempRoot, env, capture: true,
		input: JSON.stringify({ hook_event_name: event, sessionId: "grok-package-smoke", cwd: tempRoot, toolName: "read_file" }),
	}).stdout;
	assert.equal(invoke("UserPromptSubmit"), "", "Grok prompt hook must only update turn state");
	const result = JSON.parse(invoke("PostToolUse"));
	assert.equal(result.hookSpecificOutput.hookEventName, "PostToolUse");
	assert.equal(result.hookSpecificOutput.additionalContext,
		fs.readFileSync(path.join(packageRoot, "hooks/data/core-context.txt"), "utf8").trimEnd());
	assert.equal(invoke("PostToolUse"), "", "packed Grok Core must deduplicate by session");
	if (process.env.DO_IT_GROK_BINARY) {
		run(process.env.DO_IT_GROK_BINARY, ["plugin", "validate", grokRoot], { cwd: tempRoot, env, capture: true });
	}
}

function installAndExerciseRootTarball(tarball, tempRoot) {
	// Check package identity before npm can install a mislabeled artifact.
	const manifest = JSON.parse(
		run("tar", ["-xOf", tarball, "package/package.json"], { capture: true }).stdout,
	);
	assert.equal(
		manifest.name,
		"@tdwhere/do-it",
		"smoke:package only supports @tdwhere/do-it",
	);
	const prefix = path.join(tempRoot, "root-prefix");
	const home = path.join(tempRoot, "home");
	const roots = {
		codex: path.join(home, ".codex"),
		claude: path.join(home, ".claude"),
		cursor: path.join(home, ".cursor", "plugins", "local", "do-it-cursor"),
	};
	fs.mkdirSync(prefix, { recursive: true });
	fs.mkdirSync(home, { recursive: true });
	run("npm", [
		"install",
		"--global",
		"--prefix",
		prefix,
		"--offline",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		tarball,
	]);

	const executable = path.join(
		prefix,
		"bin",
		process.platform === "win32" ? "do-it.cmd" : "do-it",
	);
	assert.ok(
		fs.existsSync(executable),
		`installed do-it executable missing at ${executable}`,
	);

	for (const target of ["codex", "claude", "cursor"]) {
		const env = {
			...process.env,
			HOME: home,
			USERPROFILE: home,
			CODEX_HOME: roots.codex,
			CLAUDE_PLUGIN_ROOT_OVERRIDE: roots.claude,
			CURSOR_PLUGIN_ROOT_OVERRIDE: roots.cursor,
			DO_IT_FORCE: "1",
		};
		for (const command of ["setup", "doctor"]) {
			const result = run(executable, [command, `--target=${target}`], {
				env,
				capture: true,
			});
			assertNoCheckoutDependency(`${result.stdout}${result.stderr}`, repoRoot);
		}
	}

	assert.ok(fs.existsSync(path.join(roots.codex, ".do-it-install-state.json")));
	assert.ok(
		fs.existsSync(path.join(roots.claude, ".do-it-install-state-claude.json")),
	);
	assert.ok(
		fs.existsSync(path.join(roots.cursor, ".do-it-install-state-cursor.json")),
	);
	assert.ok(
		!fs.lstatSync(roots.cursor).isSymbolicLink(),
		"Cursor install must be a real copy",
	);
	const packageRoot = path.resolve(path.dirname(fs.realpathSync(executable)), "..");
	exercisePackedGrok(packageRoot, tempRoot, manifest.version);
}

async function main() {
	const keep = process.argv.includes("--keep");
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "do-it-package-smoke-"),
	);
	const packs = path.join(tempRoot, "packs");
	fs.mkdirSync(packs, { recursive: true });

	try {
		const { rootTarball, source } = resolveSmokeTarballs(process.argv.slice(2), {
			packRoot: () => pack(repoRoot, packs),
		});
		installAndExerciseRootTarball(rootTarball, tempRoot);
		console.log(`package smoke passed (${source}): ${path.basename(rootTarball)}`);
	} finally {
		if (keep) console.log(`package smoke artifacts kept at ${tempRoot}`);
		else fs.rmSync(tempRoot, { recursive: true, force: true });
	}
}

const isDirectRun =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
	main().catch((error) => {
		console.error(error.stack || error.message);
		process.exitCode = 1;
	});
}
