#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const pluginRoot = path.join(repoRoot, "plugins", "do-it-pi");

const PI_CLI_RELATIVE = [
	"@earendil-works",
	"pi-coding-agent",
	"dist",
	"cli.js",
];

export function buildPiInvocation(
	installPath,
	platform = process.platform,
	env = process.env,
	existsSync = fs.existsSync,
) {
	if (platform !== "win32") {
		return { command: "pi", args: ["install", installPath] };
	}

	const searchPath = env.Path ?? env.PATH ?? env.path ?? "";
	for (const rawDir of searchPath.split(path.win32.delimiter)) {
		const shimDir = rawDir.trim().replace(/^"|"$/g, "");
		if (!shimDir || !existsSync(path.win32.join(shimDir, "pi.cmd"))) continue;
		const candidates = [
			path.win32.resolve(shimDir, "..", ...PI_CLI_RELATIVE),
			path.win32.join(shimDir, "node_modules", ...PI_CLI_RELATIVE),
		];
		const entrypoint = candidates.find((candidate) => existsSync(candidate));
		if (entrypoint) {
			return {
				command: process.execPath,
				args: [entrypoint, "install", installPath],
			};
		}
	}

	throw new Error(
		"pi.cmd was not found with its @earendil-works/pi-coding-agent CLI on PATH",
	);
}

export function main(installRoot = pluginRoot) {
	if (
		!fs.existsSync(path.join(installRoot, "skills", "do-it-router", "SKILL.md"))
	) {
		throw new Error(
			"plugins/do-it-pi is not built — run npm run build:pi-plugin first",
		);
	}
	if (!fs.existsSync(path.join(installRoot, "hooks", "router.sh"))) {
		throw new Error(
			"plugins/do-it-pi hooks missing — run npm run build:pi-plugin first",
		);
	}
	if (!fs.existsSync(path.join(installRoot, "agents", "code-mapper.md"))) {
		throw new Error(
			"plugins/do-it-pi package agents missing — run npm run build:pi-plugin first",
		);
	}

	const invocation = buildPiInvocation(installRoot);
	const pi = spawnSync(invocation.command, invocation.args, {
		cwd: repoRoot,
		encoding: "utf8",
		stdio: "inherit",
	});
	if (pi.status !== 0) {
		throw new Error("pi install failed — is `pi` on PATH?");
	}

	console.log(`installed do-it-pi from ${installRoot}`);
	console.log(
		"In Pi, run /reload, then use /do-it-status to check Bash and optional pi-subagents.",
	);
	console.log(
		"Skills and prompts work without pi-subagents; executable package agents use do-it.* names when it is installed.",
	);
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main(process.argv[2] ? path.resolve(process.argv[2]) : pluginRoot);
}
