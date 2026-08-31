import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const referencePath = path.join(
  repoRoot,
  "skills/do-it/references/stateful-change-scan.md"
);

const FACE_HEADINGS = [
  "Identity",
  "Interleaving",
  "Commit",
  "Amplification",
  "Copies & Recovery"
];

const FACE_LABELS = [
  "Trigger signals",
  "Key questions",
  "Common mistakes",
  "Minimum proof"
];

function readReference() {
  assert.equal(fs.existsSync(referencePath), true, `missing ${referencePath}`);
  return fs.readFileSync(referencePath, "utf8");
}

function h2Titles(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}

function h2Sections(text) {
  const matches = [...text.matchAll(/^## (.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    return { title: match[1], body: text.slice(start, end) };
  });
}

test("stateful change scan reference exists", () => {
  assert.equal(fs.existsSync(referencePath), true);
});

test("reference names the five faces as H2 headings in order", () => {
  const titles = h2Titles(readReference());
  const indexes = FACE_HEADINGS.map((name) => titles.indexOf(name));
  assert.ok(
    indexes.every((index) => index >= 0),
    `missing face heading; found: ${titles.join(", ")}`
  );
  assert.deepEqual(
    [...indexes].sort((a, b) => a - b),
    indexes,
    "five faces must keep Identity → Interleaving → Commit → Amplification → Copies & Recovery"
  );
});

test("each face carries trigger, questions, mistakes, and minimum proof", () => {
  const sections = h2Sections(readReference());
  for (const name of FACE_HEADINGS) {
    const section = sections.find((entry) => entry.title === name);
    assert.ok(section, `missing ## ${name}`);
    for (const label of FACE_LABELS) {
      assert.match(
        section.body,
        new RegExp(`\\*\\*${label}:\\*\\*`),
        `## ${name} missing **${label}:**`
      );
    }
  }
});

test("anti-checklist constrains the scan to applicable faces", () => {
  const text = readReference();
  assert.ok(h2Titles(text).includes("Anti-checklist"), "missing ## Anti-checklist");
  assert.match(text, /not a required pass on every task/i);
  assert.match(text, /only applicable faces/i);
});

test("owners stay distinct from mechanism", () => {
  const text = readReference();
  assert.ok(h2Titles(text).includes("Owners vs mechanism"));
  assert.match(text, /\*\*Semantic owner\*\*/);
  assert.match(text, /\*\*Retry owner\*\*/);
  assert.match(text, /\*\*Recovery owner\*\*/);
  assert.match(text, /\*\*Mechanism\*\*/);
});

test("short examples cover webhook, RMW, nested retry, and stale projection", () => {
  const text = readReference();
  for (const heading of [
    "### Webhook duplicate",
    "### Read-modify-write",
    "### Multi-layer retry",
    "### Stale projection"
  ]) {
    assert.match(text, new RegExp(`^${heading}$`, "m"), `missing ${heading}`);
  }
  assert.match(text, /\bB05\b/);
  assert.match(text, /\bB06\b/);
  assert.match(text, /\bB07\b/);
});
