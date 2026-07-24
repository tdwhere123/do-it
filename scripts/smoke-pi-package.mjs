#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

export function resolveNpmInvocation({
	env = process.env,
	execPath = process.execPath,
	platform = process.platform,
	existsSync = fs.existsSync,
} = {}) {
	const pathApi = platform === "win32" ? path.win32 : path;
	const executableDir = pathApi.dirname(execPath);
	const candidates = [
		env.npm_execpath,
		platform === "win32"
			? pathApi.join(
					executableDir,
					"node_modules",
					"npm",
					"bin",
					"npm-cli.js",
				)
			: pathApi.resolve(
					executableDir,
					"..",
					"lib",
					"node_modules",
					"npm",
					"bin",
					"npm-cli.js",
				),
	].filter(Boolean);
	const npmCli = candidates.find((candidate) => existsSync(candidate));
	if (npmCli) return { command: execPath, prefixArgs: [npmCli] };
	if (platform === "win32") {
		throw new Error("npm-cli.js was not found beside the active Node runtime");
	}
	return { command: "npm", prefixArgs: [] };
}

function runNpm(args, options = {}) {
	const invocation = resolveNpmInvocation();
	const result = spawnSync(
		invocation.command,
		[...invocation.prefixArgs, ...args],
		{
			encoding: "utf8",
			...options,
		},
	);
	if (result.status !== 0) {
		throw new Error(
			`npm ${args.join(" ")} failed (${result.status}):\n${result.error?.message || result.stderr || result.stdout}`,
		);
	}
	return result.stdout;
}

export function packPiPackage(repoRoot = defaultRepoRoot, outputDir) {
	const pluginRoot = path.join(repoRoot, "plugins", "do-it-pi");
	const destination =
		outputDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-pack-"));
	fs.mkdirSync(destination, { recursive: true });
	const report = JSON.parse(
		runNpm(
			["pack", "--json", "--ignore-scripts", "--pack-destination", destination],
			{
				cwd: pluginRoot,
			},
		),
	);
	const filename = report[0]?.filename;
	if (!filename)
		throw new Error("Pi npm pack did not report a tarball filename");
	return path.join(destination, filename);
}

export function smokePiTarball(tarball) {
	const installRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "do-it-pi-install-"),
	);
	try {
		fs.writeFileSync(
			path.join(installRoot, "package.json"),
			`${JSON.stringify({ name: "do-it-pi-smoke", version: "0.0.0", private: true }, null, 2)}\n`,
		);
		runNpm(
			[
				"install",
				"--ignore-scripts",
				"--no-audit",
				"--no-fund",
				"--omit=dev",
				path.resolve(tarball),
			],
			{ cwd: installRoot },
		);

		const installedRoot = path.join(
			installRoot,
			"node_modules",
			"@tdwhere",
			"do-it-pi",
		);
		const manifest = JSON.parse(
			fs.readFileSync(path.join(installedRoot, "package.json"), "utf8"),
		);
		if (manifest.name !== "@tdwhere/do-it-pi")
			throw new Error("installed Pi package name mismatch");
		if (manifest.pi?.extensions?.join(",") !== "./extensions/index.ts") {
			throw new Error("installed Pi extension metadata mismatch");
		}
		if (!manifest.pi?.subagents?.agents?.includes("./agents")) {
			throw new Error("installed Pi package-agent metadata is missing");
		}
		for (const relativePath of [
			"LICENSE",
			"README.md",
			"extensions/index.ts",
			"extensions/bridge.ts",
			"hooks/router.sh",
			"hooks/subagent-stance.sh",
			"skills/do-it-router/SKILL.md",
			"agents/code-mapper.md",
		]) {
			if (!fs.existsSync(path.join(installedRoot, relativePath))) {
				throw new Error(`installed Pi package is missing ${relativePath}`);
			}
		}
		if (
			fs.existsSync(
				path.join(installedRoot, "extensions", "enable-fff-multigrep.ts"),
			)
		) {
			throw new Error(
				"installed Pi package retained forced fff-multi-grep activation",
			);
		}
		if (fs.existsSync(path.join(installRoot, "node_modules", "pi-subagents"))) {
			throw new Error(
				"optional pi-subagents peer was installed by the dependency-absent smoke",
			);
		}
		return { installRoot, packageRoot: installedRoot, manifest };
	} catch (error) {
		fs.rmSync(installRoot, { recursive: true, force: true });
		throw error;
	}
}

export function smokePiHostLoad(packageRoot, repoRoot = defaultRepoRoot) {
	const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-host-"));
	const agentDir = path.join(tempHome, ".pi", "agent");
	const projectDir = path.join(tempHome, "project");
	fs.mkdirSync(projectDir, { recursive: true });

	const piExecutable = path.join(
		repoRoot,
		"plugins",
		"do-it-pi",
		"node_modules",
		".bin",
		process.platform === "win32" ? "pi.cmd" : "pi",
	);
	if (!fs.existsSync(piExecutable)) {
		fs.rmSync(tempHome, { recursive: true, force: true });
		throw new Error(
			"Pi host smoke requires npm ci --prefix plugins/do-it-pi --ignore-scripts",
		);
	}

	const isolatedEnv = {
		...process.env,
		HOME: tempHome,
		USERPROFILE: tempHome,
		PI_CODING_AGENT_DIR: agentDir,
		PI_OFFLINE: "1",
	};
	try {
		const install = spawnSync(
			piExecutable,
			["install", path.resolve(packageRoot)],
			{
				cwd: projectDir,
				encoding: "utf8",
				env: isolatedEnv,
				shell: process.platform === "win32",
			},
		);
		if (install.status !== 0) {
			throw new Error(
				`Pi package-manager install failed (${install.status}):\n${install.stderr || install.stdout}`,
			);
		}

		const loaderUrl = pathToFileURL(
			path.join(
				repoRoot,
				"plugins",
				"do-it-pi",
				"node_modules",
				"@earendil-works",
				"pi-coding-agent",
				"dist",
				"core",
				"resource-loader.js",
			),
		).href;
		const loaderScript = `
			import { DefaultResourceLoader } from ${JSON.stringify(loaderUrl)};
			const loader = new DefaultResourceLoader({
				cwd: ${JSON.stringify(projectDir)},
				agentDir: ${JSON.stringify(agentDir)},
				noThemes: true,
				noContextFiles: true,
			});
			await loader.reload();
			const extensionResult = loader.getExtensions();
			const skills = loader.getSkills();
			const prompts = loader.getPrompts();
			console.log(JSON.stringify({
				extensions: extensionResult.extensions.map((extension) => ({
					path: extension.path,
					commands: [...extension.commands.keys()].sort(),
					handlers: [...extension.handlers.keys()].sort(),
				})),
				extensionErrors: extensionResult.errors,
				skills: skills.skills.map((skill) => skill.name).sort(),
				skillDiagnostics: skills.diagnostics,
				prompts: prompts.prompts.map((prompt) => prompt.name).sort(),
				promptDiagnostics: prompts.diagnostics,
			}));
		`;
		const loaded = spawnSync(
			process.execPath,
			["--input-type=module", "--eval", loaderScript],
			{
				cwd: projectDir,
				encoding: "utf8",
				env: isolatedEnv,
			},
		);
		if (loaded.status !== 0) {
			throw new Error(
				`Pi resource loader failed (${loaded.status}):\n${loaded.stderr || loaded.stdout}`,
			);
		}
		const report = JSON.parse(loaded.stdout.trim());
		if (report.extensionErrors.length > 0)
			throw new Error(
				`Pi extension diagnostics: ${JSON.stringify(report.extensionErrors)}`,
			);
		if (report.skillDiagnostics.length > 0)
			throw new Error(
				`Pi skill diagnostics: ${JSON.stringify(report.skillDiagnostics)}`,
			);
		if (report.promptDiagnostics.length > 0)
			throw new Error(
				`Pi prompt diagnostics: ${JSON.stringify(report.promptDiagnostics)}`,
			);
		if (report.extensions.length !== 1)
			throw new Error(
				`expected one Pi extension, got ${report.extensions.length}`,
			);

		const extension = report.extensions[0];
		if (!path.resolve(extension.path).startsWith(path.resolve(packageRoot))) {
			throw new Error(
				`Pi loaded an extension outside the unpacked tarball install: ${extension.path}`,
			);
		}
		if (!extension.commands.includes("do-it-status"))
			throw new Error("installed Pi extension did not register /do-it-status");
		for (const handler of [
			"session_start",
			"before_agent_start",
			"tool_result",
			"agent_end",
			"agent_settled",
			"session_shutdown",
		]) {
			if (!extension.handlers.includes(handler))
				throw new Error(`installed Pi extension did not register ${handler}`);
		}
		for (const skill of [
			"do-it-code-quality",
			"do-it-context",
			"do-it-decide",
			"do-it-handbook",
			"do-it-retrospective",
			"do-it-review",
			"do-it-router",
			"do-it-skill-authoring",
			"do-it-verify",
		]) {
			if (!report.skills.includes(skill))
				throw new Error(`installed Pi package did not discover skill ${skill}`);
		}
		if (
			report.prompts.length !== 10 ||
			!report.prompts.includes("code-mapper")
		) {
			throw new Error(
				`installed Pi prompt discovery mismatch: ${report.prompts.join(", ")}`,
			);
		}
		return report;
	} finally {
		fs.rmSync(tempHome, { recursive: true, force: true });
	}
}

function main() {
	const keep = process.argv.includes("--keep");
	const tarballArg = process.argv
		.slice(2)
		.find((argument) => !argument.startsWith("-") && argument.endsWith(".tgz"));
	const outputDir = tarballArg
		? undefined
		: fs.mkdtempSync(path.join(os.tmpdir(), "do-it-pi-smoke-pack-"));
	let installRoot;
	try {
		const tarball = tarballArg
			? path.resolve(tarballArg)
			: packPiPackage(defaultRepoRoot, outputDir);
		if (!fs.existsSync(tarball))
			throw new Error(`Pi tarball not found: ${tarball}`);
		const result = smokePiTarball(tarball);
		installRoot = result.installRoot;
		smokePiHostLoad(result.packageRoot);
		console.log(
			`Pi package smoke passed: ${path.basename(tarball)} (real Pi loader; optional pi-subagents absent)`,
		);
		if (keep) {
			console.log(`tarball: ${tarball}`);
			console.log(`install: ${installRoot}`);
		}
	} finally {
		if (!keep) {
			if (installRoot) fs.rmSync(installRoot, { recursive: true, force: true });
			if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
		}
	}
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
