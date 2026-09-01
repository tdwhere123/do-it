#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { collectInjectedTexts, pushInjectedText, textFromMessage } from "./trajectory.mjs";
import { conditionRouterMode, liveBlockedByCi, liveTimeoutMs } from "./workspace.mjs";

export const PI_MODEL = Object.freeze({
  provider: "deepseek",
  id: "deepseek-v4-flash",
  thinkingLevel: "max"
});

function piSdkEntry(repoRoot) {
  return path.join(
    repoRoot,
    "plugins/do-it-pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js"
  );
}

export function resolvePiSdk(repoRoot) {
  const entry = piSdkEntry(repoRoot);
  if (!fs.existsSync(entry)) {
    return { ok: false, reason: `@earendil-works/pi-coding-agent is not installed at ${entry}` };
  }
  return { ok: true, path: entry };
}

function piAgentDir(env = process.env) {
  const configured = env.PI_CODING_AGENT_DIR?.trim();
  if (configured) return path.resolve(configured);
  const home = env.HOME?.trim() || env.USERPROFILE?.trim() || os.homedir();
  return path.join(home, ".pi", "agent");
}

export function readDeepseekCredential(env = process.env) {
  const authPath = path.join(piAgentDir(env), "auth.json");
  if (!fs.existsSync(authPath)) {
    return { ok: false, reason: `Pi auth.json missing (${authPath}); deepseek API key required` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(authPath, "utf8"));
  } catch {
    return { ok: false, reason: "Pi auth.json is not valid JSON" };
  }
  const deepseek = parsed?.deepseek;
  if (!deepseek || deepseek.type !== "api_key" || !String(deepseek.key ?? "").trim()) {
    return { ok: false, reason: "Pi deepseek API key is not present in auth.json" };
  }
  return { ok: true, authPath, record: { deepseek: { type: "api_key", key: deepseek.key } } };
}

export async function probePi({ repoRoot, env = process.env } = {}) {
  if (liveBlockedByCi(env)) {
    return { ok: false, reason: "live eval is blocked in CI unless DO_IT_EVAL_LIVE=1" };
  }
  const sdk = resolvePiSdk(repoRoot);
  if (!sdk.ok) return sdk;
  const cred = readDeepseekCredential(env);
  if (!cred.ok) return cred;
  return {
    ok: true,
    host: "pi",
    model: `${PI_MODEL.provider}/${PI_MODEL.id}`,
    thinking: PI_MODEL.thinkingLevel,
    sdkPath: sdk.path
  };
}

function writeIsolatedAuth(agentDir, record) {
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, "auth.json"), `${JSON.stringify(record, null, 2)}\n`, {
    mode: 0o600
  });
}

function assistantTextFrom(message) {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  if (typeof message.text === "string") return message.text;
  return "";
}

function usageTokens(messages) {
  let tokens = 0;
  for (const message of messages ?? []) {
    const usage = message.usage ?? message.tokenUsage ?? {};
    const total = Number(usage.total ?? usage.totalTokens ?? 0) || 0;
    if (total) {
      tokens += total;
      continue;
    }
    tokens += Number(usage.input ?? usage.inputTokens ?? 0) || 0;
    tokens += Number(usage.output ?? usage.outputTokens ?? 0) || 0;
  }
  return tokens;
}

function mergeToolEvents(events) {
  const merged = new Map();
  const order = [];
  for (const event of events ?? []) {
    const id = event.toolCallId || `anon-${order.length}`;
    if (!merged.has(id)) {
      merged.set(id, {
        name: event.name,
        args: event.args && typeof event.args === "object" ? event.args : {},
        result: event.result,
        isError: event.isError === true
      });
      order.push(id);
      continue;
    }
    const prev = merged.get(id);
    const nextArgs = event.args && typeof event.args === "object" ? event.args : {};
    merged.set(id, {
      name: event.name || prev.name,
      args: Object.keys(nextArgs).length ? nextArgs : prev.args,
      result: event.result ?? prev.result,
      isError: event.isError === true || prev.isError === true
    });
  }
  return order.map((id) => merged.get(id));
}

function toolCallsFromMessages(messages) {
  const calls = [];
  for (const message of messages ?? []) {
    const content = Array.isArray(message.content) ? message.content : [];
    for (const part of content) {
      const name = part?.name ?? part?.toolName ?? part?.function?.name;
      const args = part?.args ?? part?.input ?? part?.function?.arguments;
      if (!name) continue;
      if (part?.type && !/tool|function/i.test(part.type)) continue;
      let parsed = args;
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          parsed = { command: parsed };
        }
      }
      calls.push({ name, args: parsed && typeof parsed === "object" ? parsed : {} });
    }
  }
  return calls;
}

async function importPiSdk(repoRoot, loader) {
  if (loader) return loader();
  const resolved = resolvePiSdk(repoRoot);
  if (!resolved.ok) throw new Error(resolved.reason);
  return import(pathToFileURL(resolved.path).href);
}

export async function runPiPrompt(job) {
  const {
    repoRoot,
    cwd,
    prompt,
    condition,
    pluginRoot,
    env = process.env,
    importSdk,
    timeoutMs
  } = job;
  const cred = readDeepseekCredential(env);
  if (!cred.ok) throw new Error(cred.reason);

  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "do-it-eval-pi-agent-"));
  writeIsolatedAuth(agentDir, cred.record);

  const sdk = await importPiSdk(repoRoot, importSdk);
  const {
    createAgentSession,
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    SettingsManager
  } = sdk;

  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    allowModelNetwork: false
  });
  const model = modelRuntime.getModel(PI_MODEL.provider, PI_MODEL.id);
  if (!model) {
    throw new Error(`Pi model ${PI_MODEL.provider}/${PI_MODEL.id} is not in the runtime catalog`);
  }

  const settingsManager = SettingsManager.create(cwd, agentDir);
  const loaderOptions = {
    cwd,
    agentDir,
    settingsManager,
    noContextFiles: false
  };
  if (condition === "vanilla" || !pluginRoot) {
    loaderOptions.noExtensions = true;
    loaderOptions.noSkills = true;
    loaderOptions.noPromptTemplates = true;
  } else {
    const extension = path.join(pluginRoot, "extensions", "index.ts");
    const skills = path.join(pluginRoot, "skills");
    const prompts = path.join(pluginRoot, "agents");
    if (fs.existsSync(extension)) loaderOptions.additionalExtensionPaths = [extension];
    if (fs.existsSync(skills)) loaderOptions.additionalSkillPaths = [skills];
    if (fs.existsSync(prompts)) loaderOptions.additionalPromptTemplatePaths = [prompts];
  }

  const previous = {
    PI_CODING_AGENT_DIR: env.PI_CODING_AGENT_DIR,
    DO_IT_ROUTER_MODE: env.DO_IT_ROUTER_MODE
  };
  process.env.PI_CODING_AGENT_DIR = agentDir;
  if (condition === "vanilla") delete process.env.DO_IT_ROUTER_MODE;
  else process.env.DO_IT_ROUTER_MODE = conditionRouterMode(condition);

  const events = [];
  const injectedTexts = [];
  const started = Date.now();
  let session;
  try {
    const resourceLoader = new DefaultResourceLoader(loaderOptions);
    await resourceLoader.reload();
    const created = await createAgentSession({
      cwd,
      agentDir,
      model,
      thinkingLevel: PI_MODEL.thinkingLevel,
      modelRuntime,
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory()
    });
    session = created.session;
    session.subscribe((event) => {
      if (event.type === "tool_execution_end" || event.type === "tool_execution_start") {
        events.push({
          toolCallId: event.toolCallId,
          name: event.toolName,
          args: event.args,
          result: event.result,
          isError: event.isError === true,
          phase: event.type
        });
      }
      if (event.type === "message_end" && event.message) {
        if (String(event.message.role ?? "").toLowerCase() !== "assistant") {
          pushInjectedText(injectedTexts, textFromMessage(event.message));
        }
      }
    });

    const limit = timeoutMs ?? liveTimeoutMs(env);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        session.abort?.();
        reject(new Error(`Pi live run timed out after ${limit}ms`));
      }, limit);
    });
    try {
      await Promise.race([session.prompt(prompt), timeout]);
    } finally {
      clearTimeout(timer);
    }

    const messages = session.messages ?? [];
    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
    return {
      host: "pi",
      model: `${PI_MODEL.provider}/${PI_MODEL.id}`,
      thinking: PI_MODEL.thinkingLevel,
      events: (() => {
        const fromEvents = mergeToolEvents(events);
        const hasArgs = fromEvents.some(
          (event) => event.args && Object.keys(event.args).length > 0
        );
        return hasArgs ? fromEvents : toolCallsFromMessages(messages);
      })(),
      assistantText: assistantTextFrom(lastAssistant),
      injectedTexts: collectInjectedTexts(messages, injectedTexts),
      tokens: usageTokens(messages),
      wall_ms: Date.now() - started
    };
  } finally {
    session?.dispose?.();
    if (previous.PI_CODING_AGENT_DIR == null) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous.PI_CODING_AGENT_DIR;
    if (previous.DO_IT_ROUTER_MODE == null) delete process.env.DO_IT_ROUTER_MODE;
    else process.env.DO_IT_ROUTER_MODE = previous.DO_IT_ROUTER_MODE;
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
}
