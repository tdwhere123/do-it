#!/usr/bin/env node

// Verify the closed-set quality-family contract. Detection stays intentionally
// hand-written in shell; this validator prevents the registry, docs, and tests
// from drifting into separate truths.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(repoRoot, "hooks", "data", "quality-families.tsv");
const scannerPath = path.join(repoRoot, "hooks", "lib", "write-quality-scan.sh");
const docsPath = path.join(repoRoot, "skills", "do-it", "references", "write-quality-families.md");
const testsDir = path.join(repoRoot, "tests", "hooks");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const ids = read(registryPath)
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("\t")[0])
  .filter(Boolean);
const registry = new Set(ids);
const scanner = read(scannerPath);
const docs = read(docsPath);
const tests = fs.readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.sh"))
  .map((name) => read(path.join(testsDir, name)))
  .join("\n");
const emitted = new Set([...scanner.matchAll(/wq_record_family "([a-z0-9-]+)"/g)].map((match) => match[1]));
const errors = [];

for (const id of registry) {
  if (!emitted.has(id)) errors.push(`registry family has no scanner emission: ${id}`);
  if (!docs.includes(`\`${id}\``)) errors.push(`registry family has no docs row: ${id}`);
  if (!tests.includes(id)) errors.push(`registry family has no direct test reference: ${id}`);
}
for (const id of emitted) {
  if (!registry.has(id)) errors.push(`scanner emits undeclared family: ${id}`);
}
if (new Set(ids).size !== ids.length) errors.push("quality-families.tsv contains duplicate ids");

if (errors.length > 0) {
  console.error(`validate-quality-families: ${errors.length} failure(s)`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`validate-quality-families: ${registry.size} families synchronized`);
