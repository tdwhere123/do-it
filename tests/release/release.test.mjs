import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRelease } from "../../scripts/validate-release.mjs";
import { resolveSmokeTarballs } from "../../scripts/smoke-package.mjs";
import { targetExtras } from "../../scripts/lib/manifest-extras.mjs";

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../..",
);

function assertTracked(relativePath, label = "source") {
	assert.ok(
		fs.existsSync(path.join(repoRoot, relativePath)),
		`missing ${label}: ${relativePath}`,
	);
	const tracked = spawnSync(
		"git",
		["ls-files", "--error-unmatch", "--", relativePath],
		{
			cwd: repoRoot,
			encoding: "utf8",
		},
	);
	assert.equal(tracked.status, 0, `${label} must be tracked: ${relativePath}`);
}

function assertTrackedTree(relativePath, label) {
	const fullPath = path.join(repoRoot, relativePath);
	assert.ok(fs.existsSync(fullPath), `missing ${label}: ${relativePath}`);
	const stat = fs.statSync(fullPath);
	if (stat.isDirectory()) {
		const entries = fs.readdirSync(fullPath, { withFileTypes: true });
		assert.ok(
			entries.length > 0,
			`${label} directory is empty: ${relativePath}`,
		);
		for (const entry of entries) {
			assertTrackedTree(path.join(relativePath, entry.name), label);
		}
		return;
	}
	assert.ok(
		stat.isFile(),
		`${label} must be a file or directory: ${relativePath}`,
	);
	assertTracked(relativePath, label);
}

function collectCommands(value, commands = []) {
	if (Array.isArray(value)) {
		for (const item of value) collectCommands(item, commands);
	} else if (value && typeof value === "object") {
		if (typeof value.command === "string") commands.push(value.command);
		for (const child of Object.values(value)) collectCommands(child, commands);
	}
	return commands;
}

function registeredHookSources() {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
	);
	const sourceByBasename = new Map();
	for (const targetName of Object.keys(manifest.targets ?? {})) {
		for (const extra of targetExtras(manifest, targetName)) {
			if (
				extra.kind !== "file" ||
				typeof extra.source !== "string" ||
				!extra.source.startsWith("hooks/")
			) {
				continue;
			}
			sourceByBasename.set(path.basename(extra.source), extra.source);
		}
	}

	const scripts = new Set();
	for (const configPath of [
		"hooks/hooks.json",
		"install/codex-hooks.json",
		"install/cursor-hooks.json",
		"plugins/do-it/hooks/hooks.json",
		"plugins/do-it-cursor/hooks/hooks.json",
	]) {
		const config = JSON.parse(
			fs.readFileSync(path.join(repoRoot, configPath), "utf8"),
		);
		for (const command of collectCommands(config)) {
			for (const match of command.matchAll(/\/hooks\/([A-Za-z0-9-]+\.sh)/g)) {
				scripts.add(match[1]);
			}
			for (const match of command.matchAll(
				/run-hook\.cmd\s+([A-Za-z0-9-]+)/g,
			)) {
				scripts.add(`${match[1]}.sh`);
			}
		}
	}

	return [...scripts].sort().map((basename) => {
		const source = sourceByBasename.get(basename);
		assert.ok(source, `registered hook lacks a manifest source: ${basename}`);
		return source;
	});
}

test("package scripts and registered hooks reference only tracked source; retired replay cards are absent", () => {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
	);
	const manifest = JSON.parse(
		fs.readFileSync(path.join(repoRoot, "manifest.json"), "utf8"),
	);
	const referencedScripts = new Set();
	for (const command of Object.values(pkg.scripts ?? {})) {
		for (const match of command.matchAll(
			/(?:node|bash)\s+((?:scripts|tests\/hooks)\/[\w./-]+\.(?:mjs|sh))/g,
		)) {
			referencedScripts.add(match[1]);
		}
	}

	for (const relativePath of referencedScripts) {
		assertTracked(relativePath, "package script source");
	}
	for (const relativePath of registeredHookSources()) {
		assertTracked(relativePath, "registered hook source");
	}
	for (const skill of manifest.skills ?? []) {
		assert.equal(
			typeof skill.source,
			"string",
			`manifest skill is missing source: ${skill.name}`,
		);
		assertTrackedTree(skill.source, `manifest skill source (${skill.name})`);
	}
	for (const targetName of Object.keys(manifest.targets ?? {})) {
		for (const extra of targetExtras(manifest, targetName)) {
			assert.equal(
				typeof extra.source,
				"string",
				`manifest extra is missing source: ${targetName}/${extra.name}`,
			);
			assertTrackedTree(
				extra.source,
				`manifest extra source (${targetName}/${extra.name})`,
			);
		}
	}
	assertTrackedTree("commands", "Claude command source");
	assert.equal(
		fs.existsSync(path.join(repoRoot, "evals", "behavioral-replays")),
		false,
	);
	assert.ok(
		!Object.values(pkg.scripts ?? {}).some((command) =>
			command.includes("behavioral-replays"),
		),
		"package scripts must not retain retired behavioral replay validation",
	);
});

function copyReleaseMetadata() {
	const tempRoot = fs.mkdtempSync(
		path.join(os.tmpdir(), "do-it-release-test-"),
	);
	for (const relativePath of [
		"package.json",
		"manifest.json",
		"index.json",
		"CHANGELOG.md",
		".claude-plugin/plugin.json",
		".claude-plugin/marketplace.json",
		"plugins/do-it/.codex-plugin/plugin.json",
		"plugins/do-it-grok/.grok-plugin/plugin.json",
		"plugins/do-it-cursor/.cursor-plugin/plugin.json",
		"plugins/do-it-pi/package.json",
		"plugins/do-it-pi/package-lock.json",
	]) {
		const target = path.join(tempRoot, relativePath);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(repoRoot, relativePath), target);
	}
	return tempRoot;
}

const releaseVersion = JSON.parse(
	fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;

test("release guard accepts a matching tag, metadata set, and changelog entry", () => {
	const result = validateRelease(`v${releaseVersion}`, repoRoot);
	assert.equal(result.version, releaseVersion);
	assert.equal(result.checkedVersions, 11);
});

test("release guard accepts a local Codex cachebuster on the matching base version", () => {
	const tempRoot = copyReleaseMetadata();
	try {
		for (const relativePath of [
			"plugins/do-it/.codex-plugin/plugin.json",
		]) {
			const codexPath = path.join(tempRoot, relativePath);
			const codex = JSON.parse(fs.readFileSync(codexPath, "utf8"));
			codex.version = `${releaseVersion}+codex.local-20260716`;
			fs.writeFileSync(codexPath, `${JSON.stringify(codex, null, 2)}\n`);
		}

		assert.equal(
			validateRelease(`v${releaseVersion}`, tempRoot).version,
			releaseVersion,
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("release guard rejects Pi package-lock drift", () => {
	const tempRoot = copyReleaseMetadata();
	try {
		const lockPath = path.join(tempRoot, "plugins/do-it-pi/package-lock.json");
		const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
		lock.packages[""].version = "0.13.0";
		fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
		assert.throws(
			() => validateRelease(`v${releaseVersion}`, tempRoot),
			/Pi package lock root: 0\.13\.0/,
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("release guard rejects malformed tags", () => {
	assert.throws(
		() => validateRelease(releaseVersion, repoRoot),
		/must match vX\.Y\.Z/,
	);
});

test("release guard reports metadata and changelog drift together", () => {
	const tempRoot = copyReleaseMetadata();
	try {
		const cursorPath = path.join(
			tempRoot,
			"plugins/do-it-cursor/.cursor-plugin/plugin.json",
		);
		const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
		cursor.version = "0.13.0";
		fs.writeFileSync(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`);
		fs.writeFileSync(
			path.join(tempRoot, "CHANGELOG.md"),
			"# Changelog\n\n## Unreleased\n",
		);

		assert.throws(
			() => validateRelease(`v${releaseVersion}`, tempRoot),
			(error) => {
				assert.match(error.message, /Cursor plugin metadata: 0\.13\.0/);
				const escapedVersion = releaseVersion.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				);
				assert.match(
					error.message,
					new RegExp(`CHANGELOG\\.md: missing "## ${escapedVersion}" entry`),
				);
				return true;
			},
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("resolveSmokeTarballs packs the root package when no artifact is supplied", () => {
	let packed = 0;
	const result = resolveSmokeTarballs(["--keep"], {
		packRoot: () => {
			packed += 1;
			return "/tmp/packed-root.tgz";
		},
	});
	assert.deepEqual(result, {
		source: "packed",
		rootTarball: "/tmp/packed-root.tgz",
	});
	assert.equal(packed, 1);
});

test("resolveSmokeTarballs uses a supplied root artifact without repacking", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-smoke-resolve-"));
	try {
		const root = path.join(tempRoot, "tdwhere-do-it-0.18.1.tgz");
		fs.writeFileSync(root, "root");
		const result = resolveSmokeTarballs([root, "--keep"], {
			packRoot: () => assert.fail("must not repack a supplied artifact"),
		});
		assert.deepEqual(result, { source: "cli", rootTarball: root });
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("resolveSmokeTarballs rejects retired, unrelated, missing, and invalid inputs without packing", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-smoke-reject-"));
	const packers = {
		packRoot: () => assert.fail("invalid input must not cause packing"),
	};
	try {
		for (const input of [
			"tdwhere-do-it-opencode-0.18.1.tgz",
			"tdwhere-do-it-kimi-0.18.1.tgz",
			"tdwhere-do-it-pi-0.18.1.tgz",
			"unrelated.tgz",
			"--unknown",
			"package.zip",
		]) {
			assert.throws(
				() => resolveSmokeTarballs([input], packers),
				/expects a @tdwhere\/do-it npm-pack tarball/,
			);
		}
		const root = path.join(tempRoot, "tdwhere-do-it-0.18.1.tgz");
		assert.throws(
			() => resolveSmokeTarballs([root], packers),
			/smoke tarball missing/,
		);
		assert.throws(
			() => resolveSmokeTarballs([root, root], packers),
			/exactly one root package tarball/,
		);
		fs.mkdirSync(root);
		assert.throws(
			() => resolveSmokeTarballs([root], packers),
			/smoke tarball is not a file/,
		);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});

test("root smoke rejects a retired package disguised with a root tarball name before installation", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-smoke-identity-"));
	try {
		fs.mkdirSync(path.join(tempRoot, "package"));
		fs.writeFileSync(
			path.join(tempRoot, "package/package.json"),
			JSON.stringify({ name: "@tdwhere/do-it-opencode", version: "0.18.1" }),
		);
		const tarball = path.join(tempRoot, "tdwhere-do-it-0.18.1.tgz");
		const packed = spawnSync(
			"tar",
			["-czf", tarball, "-C", tempRoot, "package"],
			{ encoding: "utf8" },
		);
		assert.equal(packed.status, 0, packed.stderr);
		const result = spawnSync(
			process.execPath,
			[path.join(repoRoot, "scripts/smoke-package.mjs"), tarball],
			{ encoding: "utf8" },
		);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /smoke:package only supports @tdwhere\/do-it/);
	} finally {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	}
});
