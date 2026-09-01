#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { pushInjectedText } from "./trajectory.mjs";
import { conditionRouterMode, liveBlockedByCi, liveTimeoutMs } from "./workspace.mjs";

export const CURSOR_MODEL_NEEDLE = /grok-4\.6|grok 4\.6/i;

function asList(models) {
  if (Array.isArray(models)) return models;
  if (Array.isArray(models?.models)) return models.models;
  if (Array.isArray(models?.data)) return models.data;
  return [];
}

function paramDefs(model) {
  return model?.parameters ?? model?.paramDefs ?? model?.paramsDefs ?? [];
}

function paramValue(entry) {
  if (entry && typeof entry === "object") return entry.value ?? entry.id ?? entry.name;
  return entry;
}

function effortRank(value) {
  const label = String(value ?? "").toLowerCase();
  if (label === "max" || label === "xhigh") return 4;
  if (label === "high") return 3;
  if (label === "medium" || label === "med") return 2;
  if (label === "low") return 1;
  return 0;
}

function variantScore(item) {
  const label = `${item?.id ?? ""} ${item?.name ?? ""} ${item?.displayName ?? ""}`;
  let score = 0;
  if (/max|xhigh/i.test(label)) score += 40;
  else if (/\bhigh\b/i.test(label)) score += 30;
  for (const param of item?.params ?? []) {
    const id = String(param?.id ?? param?.name ?? "");
    if (/reason|think|effort/i.test(id)) score += 10 * effortRank(param.value);
    if (/^fast$/i.test(id) && String(param.value) === "false") score += 1;
  }
  return score;
}

export function highestModelParams(model) {
  if (!model || typeof model !== "object") return [];
  const variants = model.variants ?? model.presets ?? [];
  if (Array.isArray(variants) && variants.length) {
    const ranked = [...variants].sort((left, right) => variantScore(right) - variantScore(left));
    const picked = ranked[0];
    if (Array.isArray(picked?.params) && variantScore(picked) > 0) return picked.params;
  }

  const params = [];
  for (const def of paramDefs(model)) {
    const id = def.id ?? def.name;
    if (!id) continue;
    const values = def.enum ?? def.values ?? def.choices ?? def.options ?? [];
    if (!Array.isArray(values) || values.length === 0) continue;
    const labels = values.map(paramValue);
    if (/reason|think|effort/i.test(id)) {
      const ranked = [...labels].sort((left, right) => effortRank(right) - effortRank(left));
      if (ranked[0] != null) params.push({ id, value: ranked[0] });
      continue;
    }
    if (/^fast$/i.test(id) && labels.some((value) => String(value) === "false")) {
      params.push({ id, value: "false" });
    }
  }
  return params;
}

export function pickGrok46(models) {
  const list = asList(models);
  const match = list.find((item) => {
    const id = typeof item === "string" ? item : item?.id ?? "";
    const name = typeof item === "string" ? item : item?.name ?? "";
    return CURSOR_MODEL_NEEDLE.test(id) || CURSOR_MODEL_NEEDLE.test(name);
  });
  if (!match) return { ok: false, reason: "Cursor.models.list() has no Grok 4.6 id" };
  const model = typeof match === "string" ? { id: match } : match;
  return {
    ok: true,
    id: model.id,
    params: highestModelParams(model),
    model
  };
}

export async function probeCursor({ env = process.env, importSdk } = {}) {
  if (liveBlockedByCi(env)) {
    return { ok: false, reason: "live eval is blocked in CI unless DO_IT_EVAL_LIVE=1" };
  }
  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, reason: "CURSOR_API_KEY is not set" };
  }
  try {
    const sdk = importSdk ? await importSdk() : await import("@cursor/sdk");
    if (!sdk?.Agent || !sdk?.Cursor) {
      return { ok: false, reason: "@cursor/sdk does not export Agent and Cursor" };
    }
    return { ok: true, host: "cursor", apiKey, sdk };
  } catch (error) {
    return {
      ok: false,
      reason: `@cursor/sdk is not installed (${error.message})`
    };
  }
}

function contentText(message) {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message.text === "string") return message.text;
  const content = message.content ?? message.message?.content ?? [];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part && typeof part.text === "string" ? part.text : "")).join("");
}

function isAssistantPayload(event) {
  const type = event?.type;
  const message = event?.message ?? event;
  return type === "assistant" || String(message?.role ?? "").toLowerCase() === "assistant";
}

export function collectCursorEvent(event, events, assistantChunks, injectedTexts) {
  const type = event?.type;
  if (type === "tool_call" && (event.status === "completed" || event.status === "error" || !event.status)) {
    events.push({
      name: event.name ?? event.tool ?? event.toolName,
      args: event.args ?? event.arguments ?? event.params ?? {},
      result: event.result,
      isError: event.status === "error" || event.isError === true
    });
  }
  const message = event.message ?? event;
  if (isAssistantPayload(event)) {
    const text = contentText(message);
    if (text) assistantChunks.push(text);
  }
  if (type === "tool_call" && Array.isArray(event.message?.content)) {
    for (const block of event.message.content) {
      if (block?.type === "text") pushInjectedText(injectedTexts, block.text);
    }
  }
  if (!isAssistantPayload(event)) {
    pushInjectedText(injectedTexts, contentText(message));
  }
}

const CURSOR_PROMPT_PATH_HOOKS = ["session-start.sh", "prompt-submit.sh"];
const CURSOR_HOOK_TIMEOUT_MS = 25_000;

// Cursor session-start emits `{additional_context}`; prompt-submit uses
// Claude-shaped `hookSpecificOutput.additionalContext`. Scan both so the
// meter matches what Cursor actually injects.
export function parseHookAdditionalContext(stdout) {
  const texts = [];
  for (const line of String(stdout ?? "").split("\n")) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(candidate);
      const nested = parsed?.hookSpecificOutput;
      const fromHook =
        nested && typeof nested === "object" && !Array.isArray(nested)
          ? nested.additionalContext
          : undefined;
      for (const value of [fromHook, parsed?.additional_context]) {
        if (typeof value === "string" && value) texts.push(value);
      }
    } catch {
      // Advisory hooks may mix diagnostics with JSON protocol lines.
    }
  }
  return texts;
}

function spawnCursorPromptHook(scriptPath, payload, hookEnv, cwd) {
  return spawnSync("bash", [scriptPath], {
    cwd,
    input: payload,
    encoding: "utf8",
    env: hookEnv,
    timeout: CURSOR_HOOK_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024
  });
}

function meterSessionId() {
  return `eval-meter-${crypto.randomBytes(8).toString("hex")}`;
}

// Spawn the Cursor prompt-path hooks against a throwaway session_id.
// The live Agent must not share that id: prompt-submit writes kernel_hash
// and would silence the real hook on the same session.
export function captureCursorHookInjections({
  pluginRoot,
  cwd = ".",
  prompt = "",
  env = process.env
} = {}) {
  const texts = [];
  if (!pluginRoot) return texts;
  const hooksDir = path.join(pluginRoot, "hooks");
  const sessionId = meterSessionId();
  const payload = JSON.stringify({
    session_id: sessionId,
    cwd,
    prompt,
    transcript_path: ""
  });
  let dataDir;
  try {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-meter-"));
    const hookEnv = {
      ...process.env,
      ...env,
      CURSOR_PLUGIN_ROOT: pluginRoot,
      CURSOR_PLUGIN_DATA: dataDir,
      DO_IT_HOOK_DATA: dataDir
    };
    delete hookEnv.DO_IT_CONTEXT_OUTPUT;
    delete hookEnv.KIMI_CODE_HOME;
    delete hookEnv.KIMI_PLUGIN_ROOT;
    for (const script of CURSOR_PROMPT_PATH_HOOKS) {
      const scriptPath = path.join(hooksDir, script);
      if (!fs.existsSync(scriptPath)) continue;
      const result = spawnCursorPromptHook(scriptPath, payload, hookEnv, cwd);
      const stdout = result.stdout ?? "";
      const parsed = parseHookAdditionalContext(stdout);
      if (parsed.length) {
        for (const text of parsed) pushInjectedText(texts, text);
      } else {
        pushInjectedText(texts, stdout);
      }
    }
  } catch {
    // Metering must not fail the live run.
  } finally {
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  }
  return texts;
}

export async function runCursorPrompt(job) {
  const {
    cwd,
    prompt,
    condition,
    pluginRoot,
    env = process.env,
    importSdk,
    timeoutMs
  } = job;
  const probe = await probeCursor({ env, importSdk });
  if (!probe.ok) throw new Error(probe.reason);
  const { Agent, Cursor } = probe.sdk;
  const listed = await Cursor.models.list({ apiKey: probe.apiKey });
  const picked = pickGrok46(listed);
  if (!picked.ok) throw new Error(picked.reason);

  const previous = {
    CURSOR_PLUGIN_ROOT: env.CURSOR_PLUGIN_ROOT,
    DO_IT_ROUTER_MODE: env.DO_IT_ROUTER_MODE
  };
  if (pluginRoot) process.env.CURSOR_PLUGIN_ROOT = pluginRoot;
  if (condition === "vanilla") delete process.env.DO_IT_ROUTER_MODE;
  else process.env.DO_IT_ROUTER_MODE = conditionRouterMode(condition);

  const settingSources = condition === "vanilla" || !pluginRoot ? [] : ["project"];
  const events = [];
  const assistantChunks = [];
  const injectedTexts =
    condition === "vanilla" || !pluginRoot
      ? []
      : captureCursorHookInjections({
          pluginRoot,
          cwd,
          prompt,
          env: process.env
        });
  const started = Date.now();
  let agent;
  try {
    agent = await Agent.create({
      apiKey: probe.apiKey,
      model: {
        id: picked.id,
        params: picked.params
      },
      local: {
        cwd,
        settingSources
      }
    });
    const run = await agent.send(prompt);
    const limit = timeoutMs ?? liveTimeoutMs(env);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        run.cancel?.();
        reject(new Error(`Cursor live run timed out after ${limit}ms`));
      }, limit);
    });
    try {
      if (typeof run.stream === "function") {
        for await (const event of run.stream()) {
          collectCursorEvent(event, events, assistantChunks, injectedTexts);
        }
      }
      const result = await Promise.race([
        typeof run.wait === "function" ? run.wait() : Promise.resolve(run),
        timeout
      ]);
      const resultText = result?.result ?? result?.text ?? assistantChunks.join("");
      const tokens =
        Number(result?.usage?.totalTokens ?? result?.usage?.total ?? 0) ||
        Number(result?.tokens ?? 0);
      return {
        host: "cursor",
        model: picked.id,
        thinking: picked.params,
        events,
        assistantText: String(resultText ?? assistantChunks.join("")),
        injectedTexts,
        tokens,
        wall_ms: Date.now() - started
      };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    if (typeof agent?.close === "function") await agent.close();
    if (typeof agent?.[Symbol.asyncDispose] === "function") await agent[Symbol.asyncDispose]();
    if (previous.CURSOR_PLUGIN_ROOT == null) delete process.env.CURSOR_PLUGIN_ROOT;
    else process.env.CURSOR_PLUGIN_ROOT = previous.CURSOR_PLUGIN_ROOT;
    if (previous.DO_IT_ROUTER_MODE == null) delete process.env.DO_IT_ROUTER_MODE;
    else process.env.DO_IT_ROUTER_MODE = previous.DO_IT_ROUTER_MODE;
  }
}
