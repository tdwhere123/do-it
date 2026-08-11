import assert from "node:assert/strict";
import test from "node:test";

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_RULE_IDS,
  parseCoreRegistry,
  validateCoreConsistency,
  validateCoreRegistry,
  validateCoreRuleBullets
} from "../scripts/validate-core-consistency.mjs";

const rows = [
  { id: "r-route", ruleText: "Route exactly once." },
  { id: "r-evidence", ruleText: "Read the evidence." },
  { id: "r-scope", ruleText: "Keep scope narrow." },
  { id: "r-verify", ruleText: "Verify the changed path." },
  { id: "r-uncertainty", ruleText: "Resolve uncertainty carefully." },
  { id: "r-boundary", ruleText: "Respect the action boundary." },
  { id: "r-report", ruleText: "Report exact evidence." },
  { id: "r-recovery", ruleText: "Diagnose before retrying." }
];

function bullet(row) {
  return `- **${row.id}** — ${row.ruleText}\n  Counters: example`;
}

const canonicalMarkdown = `## Core Rules\n\n${rows.map(bullet).join("\n")}`;

function errorsFor(markdown) {
  return validateCoreRuleBullets(rows, markdown, []);
}

test("core rule bullets match the registry one-to-one", () => {
  assert.deepEqual(errorsFor(canonicalMarkdown), []);
});

test("core rule validation rejects changed bullet content", () => {
  const mutated = canonicalMarkdown.replace("Read the evidence.", "Trust an assumption.");
  assert.ok(
    errorsFor(mutated).includes(
      "do-it-core/SKILL.md: **r-evidence** bullet text drifted from the TSV"
    )
  );
});

test("core rule validation rejects whitespace-only bullet changes", () => {
  for (const mutatedRuleText of [
    "Read the evidence. ",
    "Read theevidence.",
    "Read  the evidence."
  ]) {
    const mutated = canonicalMarkdown.replace("Read the evidence.", mutatedRuleText);
    assert.ok(
      errorsFor(mutated).includes(
        "do-it-core/SKILL.md: **r-evidence** bullet text drifted from the TSV"
      ),
      `accepted whitespace mutation: ${JSON.stringify(mutatedRuleText)}`
    );
  }
});

test("core rule validation rejects extra and unknown bullets", () => {
  const mutated = `${canonicalMarkdown}\n- **r-invented** — Invent a rule.\n  Counters: example`;
  const errors = errorsFor(mutated);
  assert.ok(errors.includes("do-it-core/SKILL.md: expected exactly 8 rule bullets, found 9"));
  assert.ok(errors.includes("do-it-core/SKILL.md: unknown rule bullet **r-invented**"));
});

test("core rule validation rejects removed and zero parsed bullets", () => {
  const removed = canonicalMarkdown.replace(`${bullet(rows[2])}\n`, "");
  const removedErrors = errorsFor(removed);
  assert.ok(removedErrors.includes("do-it-core/SKILL.md: expected exactly 8 rule bullets, found 7"));
  assert.ok(removedErrors.includes("do-it-core/SKILL.md: missing **r-scope** bullet"));

  const zeroErrors = errorsFor("## Core Rules\n\nNo rendered rule bullets.");
  assert.ok(zeroErrors.includes("do-it-core/SKILL.md: expected exactly 8 rule bullets, found 0"));
  for (const row of rows) {
    assert.ok(zeroErrors.includes(`do-it-core/SKILL.md: missing **${row.id}** bullet`));
  }
});

test("core rule validation rejects duplicate IDs even when content is canonical", () => {
  const mutated = `${canonicalMarkdown}\n${bullet(rows[0])}`;
  const errors = errorsFor(mutated);
  assert.ok(errors.includes("do-it-core/SKILL.md: expected exactly 8 rule bullets, found 9"));
  assert.ok(
    errors.includes("do-it-core/SKILL.md: duplicate rule bullet **r-route** (found 2)")
  );
});

test("closed-set registry validation rejects unknown, duplicate, and missing ids", () => {
  const errors = [];
  validateCoreRegistry(
    [...rows.filter((row) => row.id !== "r-report"), { ...rows[0], id: "r-unknown" }, rows[0]],
    errors
  );
  assert.ok(errors.some((error) => error.includes("missing required rule_id r-report")));
  assert.ok(errors.some((error) => error.includes("unexpected rule_id r-unknown")));
  assert.ok(errors.some((error) => error.includes("duplicate rule_id r-route")));
  assert.deepEqual(REQUIRED_RULE_IDS, rows.map((row) => row.id));
});

test("registry parsing rejects malformed rows and invalid injection surfaces", () => {
  const parseErrors = [];
  assert.deepEqual(parseCoreRegistry("r-route\trule\tfailure\n", parseErrors), []);
  assert.ok(parseErrors[0].includes("expected 4"));

  const validationErrors = [];
  validateCoreRegistry(
    rows.map((row) => ({
      ...row,
      failureModes: row.id === "r-evidence" ? "failure,,failure" : "failure",
      surface: row.id === "r-route" ? "none,UserPromptSubmit" : "none"
    })),
    validationErrors
  );
  assert.ok(validationErrors.some((error) => error.includes("invalid failure_modes")));
  assert.ok(validationErrors.some((error) => error.includes("invalid injection_surface")));
});

function createRepositoryFixture(repoRoot) {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "do-it-core-consistency-"));
  for (const relative of [
    "hooks",
    "skills/do-it",
    "plugins/do-it/hooks",
    "plugins/do-it/skills/do-it-core",
    "plugins/do-it-cursor/hooks",
    "plugins/do-it-cursor/skills/do-it-core",
    "plugins/do-it-opencode/hooks",
    "plugins/do-it-opencode/skills/do-it-core",
    "plugins/do-it-pi/hooks",
    "plugins/do-it-pi/skills/do-it-core",
    "plugins/do-it-pi/extensions/index.ts"
  ]) {
    const destination = path.join(fixtureRoot, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(repoRoot, relative), destination, { recursive: true });
  }
  return fixtureRoot;
}

test("repository validation rejects canonical hook sentences across shell literal forms", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const registryRows = parseCoreRegistry(
    readFileSync(path.join(repoRoot, "hooks/data/execution-failure-modes.tsv"), "utf8")
  );
  const ruleText = registryRows[1].ruleText;
  const literalForms = [
    `X="prefix\n${ruleText}\nsuffix"\n`,
    `X=$'prefix\\n${ruleText}\\nsuffix'\n`,
    `X='${ruleText.slice(0, 18)}'"${ruleText.slice(18)}"\n`,
    `cat <<'EOF'\n${ruleText}\nEOF\n`,
    `X=$'${ruleText.replaceAll(" ", "\\x20")}'\n`,
    `X=$'${ruleText.replaceAll(" ", "\\040")}'\n`,
    `X=$'\\u0057${ruleText.slice(1)}'\n`
  ];

  for (const literal of literalForms) {
    const fixtureRoot = createRepositoryFixture(repoRoot);
    try {
      const routerPath = path.join(fixtureRoot, "hooks/router.sh");
      writeFileSync(routerPath, `${readFileSync(routerPath, "utf8")}\n${literal}`);
      const { errors } = validateCoreConsistency(fixtureRoot);
      assert.ok(
        errors.some((error) => error.includes("source embeds the r-evidence rule sentence")),
        `${JSON.stringify(literal)}\n${errors.join("\n")}`
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test("repository validation rejects generated hook and core-skill drift", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const fixtureRoot = createRepositoryFixture(repoRoot);
  try {
    const generatedRouter = path.join(fixtureRoot, "plugins/do-it-pi/hooks/router.sh");
    writeFileSync(
      generatedRouter,
      readFileSync(generatedRouter, "utf8").replaceAll("\n", "\r\n")
    );
    const generatedSessionStart = path.join(
      fixtureRoot,
      "plugins/do-it/hooks/session-start.sh"
    );
    writeFileSync(
      generatedSessionStart,
      `${readFileSync(generatedSessionStart, "utf8")}\n# drift\n`
    );
    const generatedRunHook = path.join(
      fixtureRoot,
      "plugins/do-it-cursor/hooks/run-hook.cmd"
    );
    writeFileSync(generatedRunHook, `${readFileSync(generatedRunHook, "utf8")}\nrem drift\n`);
    const generatedSkill = path.join(
      fixtureRoot,
      "plugins/do-it-opencode/skills/do-it-core/SKILL.md"
    );
    writeFileSync(generatedSkill, `${readFileSync(generatedSkill, "utf8")}\nDrift.\n`);

    const { errors } = validateCoreConsistency(fixtureRoot);
    assert.ok(
      errors.includes(
        "plugins/do-it-pi/hooks/router.sh: generated hook drifted from hooks/router.sh"
      ),
      errors.join("\n")
    );
    assert.ok(
      errors.includes(
        "plugins/do-it/hooks/session-start.sh: generated hook drifted from hooks/session-start.sh"
      ),
      errors.join("\n")
    );
    assert.ok(
      errors.includes(
        "plugins/do-it-cursor/hooks/run-hook.cmd: generated hook drifted from hooks/run-hook.cmd"
      ),
      errors.join("\n")
    );
    assert.ok(
      errors.includes(
        "plugins/do-it-opencode/skills/do-it-core/SKILL.md: generated core skill drifted from canonical source"
      ),
      errors.join("\n")
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
