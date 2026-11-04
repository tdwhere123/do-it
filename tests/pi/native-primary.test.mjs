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

function probe(scenario, runtimeSource, unpatched = false) {
	const result = spawnSync(process.execPath, [path.join(repo, "tests/pi/fixtures/primary-probe.mjs"), scenario], {
		cwd: repo, encoding: "utf8", timeout: 45_000, maxBuffer: 4 * 1024 * 1024,
		env: { ...process.env, DO_IT_TINTINWEB_SOURCE: runtimeSource, DO_IT_PI_EXPECT_UNPATCHED: unpatched ? "1" : "0" },
	});
	assert.equal(result.status, 0, result.stderr || result.error?.message || result.stdout);
	const report = JSON.parse(result.stdout.trim());
	assert.ok(report.requests > 0);
	if (evidence) {
		fs.mkdirSync(evidence, { recursive: true });
		fs.writeFileSync(path.join(evidence, `${unpatched ? "unpatched-" : ""}${scenario}.json`), `${JSON.stringify(report, null, 2)}\n`);
	}
}

for (const scenario of ["persisted", "memory", "nested", "fork", "concurrent", "filtered"]) {
	test(`native Pi + patched Tintinweb: ${scenario}`, { skip: source ? false : "set DO_IT_TINTINWEB_SOURCE to the patched source checkout" }, () => {
		probe(scenario, source);
	});
}

test("unpatched Tintinweb is explicitly unmarked, never inferred from lineage/tools", {
	skip: baseline ? false : "set DO_IT_TINTINWEB_BASELINE to the original 0.23.0 source checkout",
}, () => probe("persisted", baseline, true));
