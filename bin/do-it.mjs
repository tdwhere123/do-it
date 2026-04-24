#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const binDir = path.dirname(fileURLToPath(import.meta.url));
const managePath = path.resolve(binDir, "..", "install", "manage.mjs");

const result = spawnSync(process.execPath, [managePath, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    DO_IT_CLI_NAME: "do-it"
  },
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exitCode = result.status ?? 1;
