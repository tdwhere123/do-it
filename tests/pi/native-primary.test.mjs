import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = process.env.DO_IT_TINTINWEB_SOURCE;
const baseline = process.env.DO_IT_TINTINWEB_BASELINE;
const evidence = process.env.DO_IT_PI_EVIDENCE_DIR;

function probe(scenario, runtimeSource, unpatched = false, fixture = "primary-probe.mjs", negative = false) {
	const result = spawnSync(process.execPath, [path.join(repo, "tests/pi/fixtures", fixture), scenario], {
		cwd: repo, encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
		env: { ...process.env, DO_IT_TINTINWEB_SOURCE: runtimeSource, DO_IT_PI_EXPECT_UNPATCHED: unpatched ? "1" : "0",
			DO_IT_PI_PROBE_NEGATIVE: negative ? "1" : "" },
	});
	let report;
	if (negative) {
		assert.equal(result.status, 1, result.stderr || result.error?.message);
		const boundary = { "root-path": "root: model-visible root Core", "interrupted-resume": "recovered: model-visible stance", "reopen-root": "reopened-root: model-visible stance" }[scenario];
		assert.ok(result.stderr.includes(boundary), result.stderr);
		report = { scenario, negative: true, exitCode: result.status, rejectedBoundary: boundary, stderr: result.stderr };
	} else {
		assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
		report = JSON.parse(result.stdout.trim());
		assert.ok(Array.isArray(report.requests) ? report.requests.length > 0 : report.requests > 0);
	}
	if (evidence) {
		fs.mkdirSync(evidence, { recursive: true });
		fs.writeFileSync(path.join(evidence, `${negative ? "negative-" : unpatched ? "unpatched-" : ""}${scenario}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
	}
}

for (const scenario of ["persisted", "memory", "nested", "fork", "concurrent", "filtered"]) {
	test(`native Pi + patched Tintinweb: ${scenario}`, { skip: source ? false : "set DO_IT_TINTINWEB_SOURCE to the patched source checkout" }, () => {
		probe(scenario, source);
	});
}

for (const scenario of ["root-path", "interrupted-resume", "reopen-root", "child-fork"]) {
	test(`native Pi lifecycle boundary: ${scenario}`, { skip: source ? false : "set DO_IT_TINTINWEB_SOURCE to the patched source checkout" }, () => {
		probe(scenario, source, false, "primary-lifecycle-probe.mjs");
	});
}

for (const scenario of ["root-path", "interrupted-resume", "reopen-root"]) {
	test(`native lifecycle negative control: ${scenario}`, { skip: source ? false : "set DO_IT_TINTINWEB_SOURCE to the patched source checkout" }, () => {
		probe(scenario, source, false, "primary-lifecycle-probe.mjs", true);
	});
}

test("unpatched Tintinweb is explicitly unmarked, never inferred from lineage/tools", {
	skip: baseline ? false : "set DO_IT_TINTINWEB_BASELINE to the original 0.23.0 source checkout",
}, () => probe("persisted", baseline, true));
