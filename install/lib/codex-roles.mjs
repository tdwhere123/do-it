import fs from "node:fs";
import path from "node:path";
import { pathState } from "./fs-transaction.mjs";

// Resolve aliases even before installation creates the final file. lstat keeps
// dangling symlinks visible so realpath rejects them rather than assuming safety.
export function resolveCodexAliasPath(alias) {
  let ancestor = alias;
  const missing = [];
  while (true) {
    try {
      fs.lstatSync(ancestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(ancestor) === ancestor) throw error;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}

// Extract key paths without treating comments or string contents as TOML syntax.
// With config role names supplied, check configured roles and file aliases;
// otherwise collect the native file's top-level string name declarations.
export function inspectCodexRoleToml(text, names = null, context = {}) {
  const {
    installRoot = "",
    canonicalAgentEntries = [],
    deprecatedEntries = [],
    resolveHomePath = (rel) => path.join(installRoot, rel)
  } = context;
  const fail = () => {
    throw new Error("ambiguous or conflicting role configuration");
  };
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === " " || char === "\t" || char === "\r") { i++; continue; }
    if (char === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (char === '"' || char === "'") {
      const multiline = text.slice(i, i + 3) === char.repeat(3);
      i += multiline ? 3 : 1;
      if (multiline && text[i] === "\r" && text[i + 1] === "\n") i += 2;
      else if (multiline && text[i] === "\n") i++;
      let value = "";
      let closed = false;
      while (i < text.length) {
        if (text[i] === char) {
          let end = i;
          while (text[end] === char) end++;
          const count = end - i;
          if (!multiline || count >= 3) {
            if (multiline && count > 5) fail();
            value += multiline ? char.repeat(count - 3) : "";
            i += multiline ? count : 1;
            closed = true;
            break;
          }
        }
        if (!multiline && /[\r\n]/.test(text[i])) fail();
        if (char === '"' && text[i] === "\\") {
          i++;
          if (multiline && /^[ \t\r]*\n/.test(text.slice(i))) {
            while (/[ \t\r\n]/.test(text[i] ?? "")) i++;
            continue;
          }
          const escape = text[i++];
          const escapes = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };
          if (Object.hasOwn(escapes, escape)) value += escapes[escape];
          else if (escape === "u" || escape === "U") {
            const digits = text.slice(i, i + (escape === "u" ? 4 : 8));
            if (!new RegExp(`^[0-9a-fA-F]{${escape === "u" ? 4 : 8}}$`).test(digits)) fail();
            const code = parseInt(digits, 16);
            if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail();
            value += String.fromCodePoint(code);
            i += digits.length;
          } else fail();
        } else value += text[i++];
      }
      if (!closed) fail();
      tokens.push({ kind: "string", value, multiline });
    } else if ("\n[]=.,{}".includes(char)) {
      tokens.push({ kind: char });
      i++;
    } else {
      const start = i;
      while (i < text.length && !/[\s#\[\]=.,{}'"\\]/.test(text[i])) i++;
      if (i === start) fail();
      tokens.push({ kind: "bare", value: text.slice(start, i) });
    }
  }
  let cursor = 0;
  const at = (kind) => tokens[cursor]?.kind === kind;
  const take = (kind) => { if (!at(kind)) fail(); return tokens[cursor++]; };
  const key = () => {
    const parts = [];
    do {
      if (parts.length) take(".");
      const token = tokens[cursor++];
      if (!token || token.multiline || !(token.kind === "string" ||
          (token.kind === "bare" && /^[A-Za-z0-9_-]+$/.test(token.value)))) fail();
      parts.push(token.value);
    } while (at("."));
    return parts;
  };
  const isConfigRole = (parts) => names !== null && parts[0] === "agents";
  const topLevelNames = [];
  const check = (parts) => {
    if (isConfigRole(parts) && names.includes(parts[1])) fail();
  };
  const assigned = new Set();
  const tables = new Set();
  const value = (parts) => {
    check(parts);
    const nativeName = names === null && parts[0] === "name";
    if (nativeName && (parts.length !== 1 || !at("string") || !tokens[cursor].value)) fail();
    if (isConfigRole(parts)) {
      const identity = JSON.stringify(parts);
      if (assigned.has(identity) || (parts[2] === "config_file" && parts.length !== 3)) fail();
      assigned.add(identity);
    }
    if (at("{")) {
      if (isConfigRole(parts) && parts.at(-1) === "config_file") fail();
      take("{");
      while (!at("}")) {
        const child = [...parts, ...key()];
        take("=");
        value(child);
        if (!at("}")) take(",");
      }
      take("}");
      return;
    }
    if (isConfigRole(parts) && (parts.length === 1 || (parts.length === 2 && at("[")))) fail();
    if (isConfigRole(parts) && parts.length === 3 && parts[2] === "config_file") {
      const token = tokens[cursor];
      if (token?.kind !== "string") fail();
      const alias = path.resolve(installRoot, token.value);
      const resolved = resolveCodexAliasPath(alias);
      const protectedEntries = [...canonicalAgentEntries, ...deprecatedEntries.filter(
        (entry) => entry.kind === "agent" && pathState(resolveHomePath(entry.target))
      )];
      if (protectedEntries.some((entry) => {
        const managed = resolveHomePath(entry.target);
        return alias === managed || resolved === resolveCodexAliasPath(managed);
      })) fail();
    }
    const start = cursor;
    const stack = [];
    while (cursor < tokens.length) {
      const kind = tokens[cursor].kind;
      if (!stack.length && ["\n", ",", "}", "]"].includes(kind)) break;
      if (kind === "[" || kind === "{") stack.push(kind === "[" ? "]" : "}");
      else if (kind === "]" || kind === "}") { if (stack.pop() !== kind) fail(); }
      cursor++;
    }
    if (cursor === start || stack.length) fail();
    if ((nativeName || (isConfigRole(parts) && parts.at(-1) === "config_file")) && cursor !== start + 1) fail();
    if (nativeName) topLevelNames.push(tokens[start].value);
  };
  let table = [];
  while (cursor < tokens.length) {
    if (at("\n")) { cursor++; continue; }
    if (at("[")) {
      take("[");
      const array = at("[");
      if (array) take("[");
      table = key();
      check(table);
      if (names === null && table[0] === "name") fail();
      if (isConfigRole(table)) {
        const identity = JSON.stringify(table);
        if (array || tables.has(identity) || assigned.has(identity) || table[2] === "config_file") fail();
        tables.add(identity);
      }
      take("]");
      if (array) take("]");
    } else {
      const parts = [...table, ...key()];
      take("=");
      value(parts);
    }
    if (cursor < tokens.length) take("\n");
  }
  return { topLevelNames };
}

export function assertCodexRoleConflictsAbsent({
  targetName,
  installRoot,
  canonicalAgentEntries,
  deprecatedEntries,
  resolveHomePath
}) {
  if (targetName !== "codex") return;
  const names = canonicalAgentEntries.map((entry) => entry.name);
  const configPath = resolveHomePath("config.toml");
  const context = { installRoot, canonicalAgentEntries, deprecatedEntries, resolveHomePath };
  if (pathState(configPath)) {
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Cannot safely inspect ${configPath}`);
    try {
      inspectCodexRoleToml(fs.readFileSync(configPath, "utf8"), names, context);
    } catch (error) {
      throw new Error(`Potential native role conflict in ${configPath}; review existing configuration before installing: ${error.message}`);
    }
  }
  const agentsPath = resolveHomePath("agents");
  if (!pathState(agentsPath)) return;
  const managedFiles = new Set(canonicalAgentEntries.map((entry) => resolveHomePath(entry.target)));
  const directories = [agentsPath];
  while (directories.length) {
    const directory = directories.pop();
    for (const file of fs.readdirSync(directory)) {
      const filePath = path.join(directory, file);
      if (managedFiles.has(filePath)) continue;
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) throw new Error(`Cannot safely inspect native role path: ${filePath}`);
      if (stat.isDirectory()) {
        directories.push(filePath);
        continue;
      }
      if (!file.endsWith(".toml")) continue;
      if (!stat.isFile()) throw new Error(`Cannot safely inspect native role file: ${filePath}`);
      let declared;
      try {
        ({ topLevelNames: declared } = inspectCodexRoleToml(fs.readFileSync(filePath, "utf8")));
      } catch (error) {
        throw new Error(`Cannot establish a unique native role name in ${filePath}: ${error.message}`);
      }
      if (declared.length !== 1) throw new Error(`Cannot establish a unique native role name in ${filePath}`);
      if (names.includes(declared[0])) throw new Error(`Native role conflict for ${declared[0]} in ${filePath}`);
    }
  }
}
