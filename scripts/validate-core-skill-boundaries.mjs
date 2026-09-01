#!/usr/bin/env node

// Thin shim. Former English regex locks now live as HTML contract anchors
// in scripts/validate-skill-contracts.mjs. `npm run validate:core-skill-boundaries`
// must keep exiting 0 when those anchors are present.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runValidateSkillContracts } from "./validate-skill-contracts.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(runValidateSkillContracts({ commandName: "validate-core-skill-boundaries" }));
}
