// Shared parser for the deliberately small canonical agent TOML format.
const AGENT_KEYS = new Set([
  "name", "description", "sandbox_mode", "developer_instructions"
]);

export function parseAgentToml(source) {
  const result = {};
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (i >= source.length) break;
    if (source[i] === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    const keyMatch = source.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/);
    if (!keyMatch) {
      throw new Error(`cannot parse key at offset ${i}: ${source.slice(i, i + 60)}`);
    }
    const key = keyMatch[1];
    if (!AGENT_KEYS.has(key)) {
      throw new Error(`agent contains unsupported Codex TOML key ${key}; keep host-private policy out of agents/*.toml`);
    }
    if (Object.hasOwn(result, key)) throw new Error(`duplicate agent key ${key}`);
    i += keyMatch[0].length;
    let value;
    if (source.startsWith('"""', i)) {
      i += 3;
      const end = source.indexOf('"""', i);
      if (end < 0) throw new Error(`unterminated triple-quoted string for key ${key}`);
      value = source.slice(i, end);
      if (value.startsWith("\n")) value = value.slice(1);
      i = end + 3;
    } else if (source[i] === '"') {
      i += 1;
      let buf = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          if (next === "n") buf += "\n";
          else if (next === "t") buf += "\t";
          else if (next === "\\") buf += "\\";
          else if (next === '"') buf += '"';
          else buf += next;
          i += 2;
        } else {
          buf += source[i];
          i += 1;
        }
      }
      if (i >= source.length) throw new Error(`unterminated string for key ${key}`);
      i += 1;
      value = buf;
    } else {
      const restMatch = source.slice(i).match(/^([^\n]*)/);
      value = restMatch[1].trim();
      i += restMatch[0].length;
    }
    result[key] = value;
  }
  if (!result.name) throw new Error("agent missing name");
  return result;
}
