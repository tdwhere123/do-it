// Observe the actual managed CLI mutation boundary in isolated test profiles.
import fs from "node:fs";
import path from "node:path";

const { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } = fs;
const home = process.env.DO_IT_TEST_MANAGED_HOME;
const root = process.env.DO_IT_TEST_MANAGED_ROOT;
const lock = path.join(home, ".cursor", ".do-it-install.lock");
const trace = process.env.DO_IT_TEST_MANAGED_TRACE;
const recoveryFaults = process.env.DO_IT_TEST_MANAGED_RECOVERY === "1";
let rollbackFaulted = false;

function observe(operation, file) {
  const target = path.resolve(String(file));
  if (target === lock || (operation === "mkdir" && target === path.dirname(lock)) ||
      !(target === root || target.startsWith(`${root}${path.sep}`) ||
      target.startsWith(`${path.join(home, ".cursor")}${path.sep}`))) return;
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(lock, "utf8")); } catch {}
  appendFileSync(trace, `${JSON.stringify({ operation, target, owned: owner?.pid === process.pid })}\n`);
}

fs.mkdirSync = function (file, ...args) {
  observe("mkdir", file);
  return mkdirSync.call(fs, file, ...args);
};
fs.writeFileSync = function (file, ...args) {
  if (typeof file !== "number") observe("write", file);
  return writeFileSync.call(fs, file, ...args);
};
fs.renameSync = function (source, target) {
  observe("rename-source", source);
  observe("rename-target", target);
  return renameSync.call(fs, source, target);
};
fs.rmSync = function (file, ...args) {
  observe("remove", file);
  if (recoveryFaults) {
    if (!rollbackFaulted && file === path.join(root, "skills", "do-it-core")) {
      rollbackFaulted = true;
      throw new Error("injected managed rollback failure");
    }
    if (String(file).includes(".do-it-install-staging-")) throw new Error("injected managed stage cleanup failure");
    if (file === lock) throw new Error("injected managed lock removal failure");
  }
  return rmSync.call(fs, file, ...args);
};
