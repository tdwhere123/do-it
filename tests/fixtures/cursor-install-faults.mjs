// Child-process fault injection for the real Cursor install/registration CLI.
import fs from "node:fs";
import path from "node:path";

const { openSync, closeSync, renameSync, rmSync, writeFileSync } = fs;
const lockFds = new Set();
fs.openSync = function (file, flags, ...args) {
  const fd = openSync.call(fs, file, flags, ...args);
  // Inject only when closing the acquired lock, not when reading its owner.
  // Node 18's readFileSync uses the public openSync/closeSync functions.
  if (flags === "wx" && String(file).endsWith(".do-it-install.lock")) lockFds.add(fd);
  return fd;
};
fs.closeSync = function (fd) {
  closeSync.call(fs, fd);
  if (lockFds.delete(fd)) throw new Error("injected lock close failure");
};
fs.renameSync = function (source, target) {
  renameSync.call(fs, source, target);
  if (String(source).includes(".do-it-stage-") && String(target).endsWith(`${path.sep}reviewer.md`)) {
    writeFileSync(target, "concurrent reviewer change\n");
  }
};
fs.rmSync = function (file, ...args) {
  if (String(file).includes(".do-it-stage-")) throw new Error("injected stage cleanup failure");
  if (String(file).endsWith(".do-it-install.lock")) throw new Error("injected lock removal failure");
  return rmSync.call(fs, file, ...args);
};
