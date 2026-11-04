// Narrow, conservative evidence for a directly executed Node test command.
// This is deliberately not a shell interpreter or a transcript recorder.
import path from "node:path";

function workspaceCommand(command, cwd) {
  let text = String(command ?? "").trim();
  if (cwd) {
    const root = path.resolve(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^cd\\s+(?:${root}|'${root}'|"${root}")\\s*&&\\s*`), "");
  }
  return text.replace(/\s+2>&1\s*$/, "").trim();
}

function parseWords(text) {
  const words = [];
  const token = /(?:'[^']*'|"[^"$`\\]*"|[A-Za-z0-9_./*?+-]+)/gy;
  let offset = 0;
  while (offset < text.length) {
    while (/\s/.test(text[offset] ?? "") && offset < text.length) offset += 1;
    if (offset === text.length) break;
    token.lastIndex = offset;
    const match = token.exec(text);
    if (!match) return null;
    const word = match[0];
    words.push(word.startsWith("'") || word.startsWith('"') ? word.slice(1, -1) : word);
    offset = token.lastIndex;
    if (offset < text.length && !/\s/.test(text[offset])) return null;
  }
  return words;
}

function nodeTestWords(argv, cwd) {
  if (!Array.isArray(argv)) return null;
  let words = argv.map(String);
  if (words.length === 3 && /^(?:.*\/)?(?:bash|sh)$/.test(words[0]) && ["-c", "-lc"].includes(words[1])) {
    words = parseWords(workspaceCommand(words[2], cwd));
  }
  if (!words || words[0] !== "node" || words[1] !== "--test") return null;
  const selectors = words.slice(2);
  if (selectors.some((item) =>
    !/^[A-Za-z0-9_./*?+-]+$/.test(item) || item.startsWith("-") ||
    item.startsWith("/") || item.split("/").includes("..")
  )) return null;
  return selectors;
}

function hiddenPath(testPath) {
  return testPath.replace(/^\.\//, "").split("/").some((part) => part.startsWith("."));
}

function matchesSelector(testPath, selector) {
  const pattern = selector.replace(/^\.\//, "");
  if (/[*?]/.test(pattern) && hiddenPath(testPath)) return false;
  let re = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*" && pattern[i + 1] === "*") {
      i += 1;
      if (pattern[i + 1] === "/") {
        i += 1;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (char === "*") re += "[^/]*";
    else if (char === "?") re += "[^/]";
    else re += char.replace(/[.\\+^$(){}|[\]]/g, "\\$&");
  }
  return new RegExp(`${re}$`).test(testPath.replace(/^\.\//, ""));
}

export function evidenceTargets(fixtureMeta = {}) {
  const targets = [...(fixtureMeta.relevant_tests ?? [])];
  for (const check of Object.values(fixtureMeta.acceptance ?? {})) {
    if (check?.type === "command_exit0" && check.argv?.[0] === "node" && check.argv?.[1] === "--test") {
      targets.push(...check.argv.slice(2));
    }
  }
  return [...new Set(targets.filter((item) => typeof item === "string" && /^[A-Za-z0-9_./+-]+$/.test(item) && !item.startsWith("/") && !item.split("/").includes("..")))];
}

function testSummary(output, targets) {
  if (typeof output !== "string" || /\[Showing lines |\[output truncated|full output:/i.test(output)) return null;
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(?:#|ℹ)\s+(tests|suites|pass|fail|cancelled|skipped|todo)\s+(\d+)\s*$/);
    if (match) {
      if (Object.hasOwn(values, match[1])) return null;
      values[match[1]] = Number(match[2]);
    }
  }
  if (["tests", "suites", "pass", "fail", "cancelled", "skipped", "todo"].some((key) => !Number.isSafeInteger(values[key]))) return null;
  // Node reports an empty/non-test file as a passing file-level subtest.
  const fileOnly = output.split(/\r?\n/).some((line) => {
    const match = line.match(/^(?:# Subtest:\s*|✔\s+)(.*?)(?:\s+\([\d.]+m?s\))?\s*$/);
    if (!match) return false;
    const name = match[1].replace(/^\.\//, "");
    return targets.some((target) => name === target || name.endsWith(`/${target}`)) ||
      /(?:^|\/)(?:tests?\/[^\s]+\.(?:[cm]?js)|[^/\s]+\.(?:test|spec)\.[cm]?js)$/.test(name);
  });
  return { ...values, file_only: fileOnly };
}

function resultOutput(result) {
  if (!result || typeof result !== "object") return null;
  if (result.structuredContent?.truncated === true || result.truncated === true || result.details?.truncation?.truncated === true) return null;
  if (typeof result.structuredContent?.output === "string") return result.structuredContent.output;
  if (typeof result.stdout === "string") return `${result.stdout}\n${result.stderr ?? ""}`;
  if (Array.isArray(result.content)) {
    return result.content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
  }
  return null;
}

function resultStatus(event) {
  const candidates = [
    ["structured_exit_code", event.result?.structuredContent?.exit_code],
    ["exitCode", event.result?.exitCode],
    ["exit", event.result?.exit],
    ["event_exit", event.exit]
  ];
  for (const [source, value] of candidates) {
    if (Number.isInteger(value) && value >= 0) {
      if ((event.isError === true || event.result?.isError === true) && value === 0) return { exit: null, exit_source: "conflict" };
      return { exit: value, exit_source: source };
    }
  }
  return { exit: null, exit_source: "unavailable" };
}

export function captureCommandEvidence({ argv, cwd, commandCwd, environmentKnown = true, event, source, targets = [], existingTargets = [], ordered = false }) {
  const inWorkspace = Boolean(cwd) && (commandCwd == null ||
    (typeof commandCwd === "string" && path.resolve(cwd, commandCwd) === path.resolve(cwd)));
  const selectors = inWorkspace && environmentKnown ? nodeTestWords(argv, cwd) : null;
  const status = resultStatus(event);
  const selected = selectors && targets.filter((target) =>
    existingTargets.includes(target) && (selectors.length === 0
      ? !hiddenPath(target) && !target.split("/").includes("node_modules") && /\.test\.[cm]?js$/.test(target)
      : selectors.some((selector) => matchesSelector(target, selector)))
  );
  return {
    exit: status.exit,
    evidence: {
      source,
      exit_source: status.exit_source,
      cwd: inWorkspace ? "workspace" : "unknown",
      ordering: ordered ? "observed" : "unknown",
      invocation: selectors ? "node-test" : "unsupported",
      selection: selectors ? (selectors.length ? "explicit" : "all") : "unknown",
      selected_tests: selected || [],
      summary: selectors ? testSummary(resultOutput(event.result), targets) : null
    }
  };
}

function observedNodeTest(step, allowHarness) {
  const evidence = step.evidence;
  const sources = allowHarness ? ["host-tool", "fixture-replay", "harness"] : ["host-tool", "fixture-replay"];
  return Boolean(evidence && sources.includes(evidence.source) &&
    ["structured_exit_code", "exitCode", "exit", "event_exit"].includes(evidence.exit_source) &&
    evidence.cwd === "workspace" && evidence.ordering === "observed" && evidence.invocation === "node-test");
}

export function passingNodeTest(step, testPath, { requireAll = false, allowHarness = false } = {}) {
  const evidence = step.evidence;
  const summary = evidence?.summary;
  if (!observedNodeTest(step, allowHarness) || step.exit !== 0 || !summary ||
      !Array.isArray(evidence.selected_tests)) return false;
  if (requireAll && evidence.selection !== "all") return false;
  if (testPath && !evidence.selected_tests.includes(testPath)) return false;
  return Number.isSafeInteger(summary.tests) && Number.isSafeInteger(summary.pass) &&
    summary.tests > 0 && summary.tests === summary.pass && summary.suites === 0 && summary.fail === 0 &&
    summary.cancelled === 0 && summary.skipped === 0 && summary.todo === 0 && summary.file_only === false;
}

export function nodeTestOutcome(step, { allowHarness = false } = {}) {
  if (passingNodeTest(step, undefined, { allowHarness })) return "passed";
  if (observedNodeTest(step, allowHarness) && Number.isInteger(step.exit) && step.exit > 0) return "failed";
  return "unverified";
}
