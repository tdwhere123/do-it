#!/usr/bin/env node

import path from "node:path";
import { captureCommandEvidence, evidenceTargets } from "../evidence.mjs";

const COMPLETION_RE =
  /(完成|已修|通过|完工|\bdone\b|\bpassed\b|\bfixed\b|\ball set\b|it works|works now|successfully|\bVERIFIED\b|ready to merge|ship it|ready to (ship|publish))/i;
const NOT_VERIFIED_RE = /\bNOT_VERIFIED\b/;
const WRITE_TOOLS = /^(write|edit|strreplace|str_replace|apply_patch|search_replace|notebook_edit)$/i;
const READ_TOOLS = /^(read|read_file)$/i;
const BASH_TOOLS = /^(bash|shell|command)$/i;
const SUBAGENT_TOOLS = /^(subagent|task|agent|dispatch|delegate)$/i;
const EXTERNAL_CMD_RE = /\b(curl|wget|gh|npm\s+publish|ssh)\b/i;
const EXTERNAL_URL_RE = /https?:\/\/(?!localhost\b|127\.\d+\.\d+\.\d+\b|\[::1\]\b)/i;

export function isExternalCommand(command) {
  const text = String(command ?? "");
  return EXTERNAL_CMD_RE.test(text) || EXTERNAL_URL_RE.test(text);
}

export function posixRel(rel) {
  return String(rel).replace(/\\/g, "/");
}

export function relativizePath(filePath, cwd) {
  if (filePath == null || filePath === "") return null;
  const raw = posixRel(filePath);
  if (!cwd) return raw.replace(/^\.\//, "");
  const root = posixRel(path.resolve(cwd));
  const abs = path.isAbsolute(filePath) ? posixRel(path.resolve(filePath)) : posixRel(path.resolve(cwd, filePath));
  if (abs === root) return ".";
  if (abs.startsWith(`${root}/`)) return abs.slice(root.length + 1);
  return raw.replace(/^\.\//, "");
}

function clip(text, max = 800) {
  const value = String(text ?? "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function toolPath(args, cwd) {
  if (!args || typeof args !== "object") return null;
  const value =
    args.path ??
    args.file_path ??
    args.filePath ??
    args.target_file ??
    args.targetFile ??
    args.notebook_path ??
    null;
  return value == null ? null : relativizePath(value, cwd);
}

// Start/end intervals are needed to rule out a write overlapping a test.
// Completion-only streams and message fallbacks cannot establish that order.
export function mergeToolEvents(events) {
  const records = [];
  const byId = new Map();
  for (const [index, event] of (events ?? []).entries()) {
    const phase = event.phase;
    const id = event.toolCallId;
    let record = id != null && id !== "" ? byId.get(id) : null;
    if (!record) {
      record = { name: event.name, args: {}, start: null, end: null };
      records.push(record);
      if (id != null && id !== "") byId.set(id, record);
    }
    if (event.name) record.name = event.name;
    if (event.args && Object.keys(event.args).length) record.args = event.args;
    if (event.result != null) record.result = event.result;
    if (event.exit != null) record.exit = event.exit;
    if (event.isError === true) record.isError = true;
    if (phase === "start" || phase === "tool_execution_start") record.start = index;
    if (phase === "end" || phase === "tool_execution_end") record.end = index;
  }
  // Unknown tools (including wrappers around other tools) may mutate too.
  const mayMutate = (record) => !READ_TOOLS.test(record.name ?? "");
  return records.map((record) => {
    const complete = record.start != null && record.end != null && record.start < record.end;
    const overlaps = records.some((other) => {
      if (other === record || !mayMutate(other)) return false;
      if (other.start == null || other.end == null) return true;
      return record.start < other.end && other.start < record.end;
    });
    const { start, end, ...event } = record;
    return { ...event, ordered: complete && !overlaps };
  });
}

export function eventsToSteps(events, cwd, { fixtureMeta = {}, existingTargets = [] } = {}) {
  const targets = evidenceTargets(fixtureMeta);
  const steps = [];
  for (const event of events ?? []) {
    const name = String(event.name ?? event.toolName ?? event.tool ?? "");
    const args = event.args ?? event.input ?? {};
    if (WRITE_TOOLS.test(name)) {
      const filePath = toolPath(args, cwd);
      if (filePath && !filePath.startsWith(".do-it/runtime/") && !filePath.startsWith(".pi/") && !filePath.startsWith(".cursor/")) {
        steps.push({
          type: "write",
          path: filePath,
          content: args.contents ?? args.content ?? args.new_string ?? args.newString
        });
      } else {
        // Excluded runtime paths are not user-scope writes, but still make
        // earlier evidence stale or uncertain.
        steps.push({ type: "unknown_write" });
      }
      continue;
    }
    if (READ_TOOLS.test(name)) {
      const filePath = toolPath(args, cwd);
      if (filePath) steps.push({ type: "read", path: filePath });
      continue;
    }
    if (BASH_TOOLS.test(name)) {
      const command = String(args.command ?? args.cmd ?? args.commandLine ?? "");
      if (!command.trim()) {
        steps.push({ type: "unknown_write" });
        continue;
      }
      const captured = captureCommandEvidence({
        argv: process.platform === "win32" ? ["cmd", "/c", command] : ["bash", "-lc", command], cwd,
        commandCwd: args.cwd ?? args.workdir ?? args.working_directory ?? args.workingDirectory,
        environmentKnown: args.env == null && args.environment == null,
        event, source: "host-tool", targets, existingTargets, ordered: event.ordered === true
      });
      steps.push({ type: "command", tool: name.toLowerCase(), ...captured });
      if (isExternalCommand(command)) {
        steps.push({ type: "external", action: "external command" });
      }
      continue;
    }
    if (SUBAGENT_TOOLS.test(name) || /sub-?agent/i.test(name)) {
      steps.push({ type: "subagent", name });
    } else {
      steps.push({ type: "unknown_write" });
    }
  }
  return steps;
}

export function mergeDiffWrites(steps, diffWrites) {
  const existing = steps ?? [];
  const seen = new Set(
    existing
      .filter((step) => step.type === "write" && step.path)
      .map((step) => posixRel(step.path))
  );
  const extra = [];
  for (const write of diffWrites ?? []) {
    const rel = posixRel(write.path);
    if (!seen.has(rel)) extra.push({ type: "write", path: rel });
  }
  if (extra.length === 0) return existing;
  // A final diff establishes that a write happened, not when it happened.
  // Place unattributed writes after observed commands, never before their evidence.
  const insertAt = existing.findIndex((step) => step.type === "claim");
  if (insertAt === -1) return [...existing, ...extra];
  return [...existing.slice(0, insertAt), ...extra, ...existing.slice(insertAt)];
}

export function claimFromAssistant(text, { hasWrites = false } = {}) {
  const value = String(text ?? "").trim();
  if (!value) return null;
  if (NOT_VERIFIED_RE.test(value)) {
    return { type: "claim", status: "NOT_VERIFIED", text: clip(value) };
  }
  if (COMPLETION_RE.test(value)) {
    return { type: "claim", status: "VERIFIED", text: clip(value) };
  }
  if (!hasWrites && /\?\s*$/.test(value) && value.length < 800) {
    return { type: "question", text: clip(value) };
  }
  return null;
}

// Compact kernel, host bootstrap, and legacy router/grill/architecture
// emissions. Cursor session-start bootstrap is untagged
// (`do-it is active. Match depth`); Pi wraps the same idea in
// `<do-it-bootstrap>`. Assistant echoes must not be mixed into `texts`
// or they inflate the recurring-injection meter.
export const INJECTED_TEXT_RE =
  /Do-it:|Do-it kernel:|<\/?system-reminder>|<\/?do-it-bootstrap>|Active do-it contract:|\bdo-it (?:tier|grill|architecture|adaptive|core registry)\b|do-it is active\. Match depth/i;

export function isInjectedText(text) {
  return INJECTED_TEXT_RE.test(String(text ?? ""));
}

export function textFromMessage(message) {
  if (message == null) return "";
  if (typeof message === "string") return message;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  if (typeof message.text === "string") return message.text;
  return "";
}

export function pushInjectedText(list, text) {
  const value = String(text ?? "");
  if (!isInjectedText(value) || list.includes(value)) return list;
  list.push(value);
  return list;
}

function isAssistantMessage(message) {
  return String(message?.role ?? "").toLowerCase() === "assistant";
}

export function collectInjectedTexts(messages, already = []) {
  const texts = [...already];
  for (const message of messages ?? []) {
    if (isAssistantMessage(message)) continue;
    pushInjectedText(texts, textFromMessage(message));
  }
  return texts;
}

export function countInjectedTokens(texts) {
  let chars = 0;
  for (const text of texts ?? []) {
    const value = String(text ?? "");
    if (isInjectedText(value)) chars += value.length;
  }
  return Math.ceil(chars / 4);
}

const INJECTED_TEXT_MAX = 2000;

function persistInjectedTexts(texts) {
  const out = [];
  for (const text of texts ?? []) {
    const value = String(text ?? "");
    if (!isInjectedText(value)) continue;
    out.push(value.length <= INJECTED_TEXT_MAX ? value : `${value.slice(0, INJECTED_TEXT_MAX)}…`);
  }
  return out;
}

export function buildTrajectory({
  events,
  assistantText,
  injectedTexts,
  diffWrites,
  cost,
  model,
  condition,
  host,
  thinking,
  cwd,
  fixtureMeta,
  existingTargets
}) {
  let steps = eventsToSteps(events, cwd, { fixtureMeta, existingTargets });
  steps = mergeDiffWrites(steps, diffWrites);
  const hasWrites = steps.some((step) => step.type === "write");
  const claim = claimFromAssistant(assistantText, { hasWrites });
  if (claim) steps.push(claim);
  const toolCalls = (events ?? []).length;
  return {
    schema: "do-it/behavior-trajectory/v2",
    model,
    condition,
    host,
    thinking: thinking ?? null,
    steps,
    injected_texts: persistInjectedTexts(injectedTexts),
    cost: {
      tokens: cost?.tokens ?? 0,
      tool_calls: cost?.tool_calls ?? toolCalls,
      wall_ms: cost?.wall_ms ?? 0,
      injected_tokens: cost?.injected_tokens ?? countInjectedTokens(injectedTexts)
    }
  };
}
