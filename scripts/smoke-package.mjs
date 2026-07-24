#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? repoRoot,
		encoding: "utf8",
		env: options.env ?? process.env,
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

/** Classify a tarball path as root or opencode from its basename (npm pack naming). */
export function classifyTarball(tarballPath) {
	const base = path.basename(tarballPath).toLowerCase();
	if (base.includes("opencode")) return "opencode";
	return "root";
}

/**
 * Resolve which artifacts to smoke.
 * - No `.tgz` CLI args: pack both packages from checkout (default).
 * - One or more `.tgz` paths: smoke those artifacts; do not repack those roles.
 *   Missing roles are skipped (caller only exercises provided tarballs).
 */
export function resolveSmokeTarballs(argv, packers) {
	const tarballArgs = argv.filter((arg) => arg.endsWith(".tgz"));
	if (tarballArgs.length === 0) {
		return {
			source: "packed",
			rootTarball: packers.packRoot(),
			openCodeTarball: packers.packOpenCode(),
		};
	}

	const absolute = tarballArgs.map((arg) => path.resolve(arg));
	for (const tarball of absolute) {
		assert.ok(fs.existsSync(tarball), `smoke tarball missing: ${tarball}`);
	}

	let rootTarball;
	let openCodeTarball;
	for (const tarball of absolute) {
		const kind = classifyTarball(tarball);
		if (kind === "opencode") {
			assert.equal(
				openCodeTarball,
				undefined,
				`duplicate opencode tarball: ${tarball}`,
			);
			openCodeTarball = tarball;
		} else {
			assert.equal(
				rootTarball,
				undefined,
				`duplicate root tarball: ${tarball}`,
			);
			rootTarball = tarball;
		}
	}

	return { source: "cli", rootTarball, openCodeTarball };
}

function assertNoCheckoutDependency(text, checkoutRoot) {
	assert.ok(
		!text.includes(checkoutRoot),
		`command output references checkout: ${checkoutRoot}`,
	);
}

function installAndExerciseRootTarball(tarball, tempRoot) {
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

	// Kimi Code consumes the repo-root plugin manifest as-is; it must ride the tarball.
	const pkgRoot = [
		path.join(prefix, "lib", "node_modules", "@tdwhere", "do-it"),
		path.join(prefix, "node_modules", "@tdwhere", "do-it"),
	].find((p) => fs.existsSync(p));
	assert.ok(pkgRoot, "installed @tdwhere/do-it package root not found");
	const kimiManifestPath = path.join(pkgRoot, "kimi.plugin.json");
	assert.ok(
		fs.existsSync(kimiManifestPath),
		"kimi.plugin.json missing from installed root package",
	);
	const kimiManifest = JSON.parse(fs.readFileSync(kimiManifestPath, "utf8"));
	const rootVersion = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
	).version;
	assert.equal(
		kimiManifest.version,
		rootVersion,
		"kimi.plugin.json version must match package.json",
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
}

async function installAndExerciseOpenCodeTarball(tarball, tempRoot) {
	const project = path.join(tempRoot, "opencode-project");
	fs.mkdirSync(project, { recursive: true });
	fs.writeFileSync(
		path.join(project, "package.json"),
		'{"type":"module","private":true}\n',
	);
	run(
		"npm",
		["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
		{ cwd: project },
	);

	const packagePath = path.join(
		project,
		"node_modules",
		"@tdwhere",
		"do-it-opencode",
	);
	const installedPackage = JSON.parse(
		fs.readFileSync(path.join(packagePath, "package.json"), "utf8"),
	);
	const rootPackage = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
	);
	assert.equal(installedPackage.version, rootPackage.version);
	assert.equal(installedPackage.publishConfig?.access, "public");
	assert.ok(fs.existsSync(path.join(packagePath, "LICENSE")));
	assert.ok(fs.existsSync(path.join(packagePath, "README.md")));
	assert.ok(fs.existsSync(path.join(packagePath, "dist", "index.js")));
	assert.ok(
		fs.existsSync(path.join(packagePath, "skills", "do-it-router", "SKILL.md")),
	);
	assert.ok(
		!fs.existsSync(path.join(packagePath, "src")),
		"OpenCode tarball must not depend on TypeScript source",
	);

	const moduleUrl = pathToFileURL(
		path.join(packagePath, "dist", "index.js"),
	).href;
	const imported = await import(moduleUrl);
	assert.equal(typeof imported.default, "function");
	assertNoCheckoutDependency(
		fs.readFileSync(path.join(packagePath, "dist", "index.js"), "utf8"),
		repoRoot,
	);
}

async function main() {
	const keep = process.argv.includes("--keep");
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "do-it-package-smoke-"),
	);
	const packs = path.join(tempRoot, "packs");
	fs.mkdirSync(packs, { recursive: true });

	try {
		const { rootTarball, openCodeTarball, source } = resolveSmokeTarballs(
			process.argv.slice(2),
			{
				packRoot: () => pack(repoRoot, packs),
				packOpenCode: () =>
					pack(path.join(repoRoot, "plugins", "do-it-opencode"), packs),
			},
		);
		assert.ok(
			rootTarball || openCodeTarball,
			"smoke:package needs a root and/or opencode .tgz (pass paths or run with no args to pack)",
		);
		if (rootTarball) installAndExerciseRootTarball(rootTarball, tempRoot);
		if (openCodeTarball)
			await installAndExerciseOpenCodeTarball(openCodeTarball, tempRoot);
		const smoked = [rootTarball, openCodeTarball]
			.filter(Boolean)
			.map((t) => path.basename(t));
		console.log(`package smoke passed (${source}): ${smoked.join(", ")}`);
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
