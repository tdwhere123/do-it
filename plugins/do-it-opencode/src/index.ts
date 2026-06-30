import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { BOOTSTRAP_TEXT } from "./bootstrap.js";
import {
  buildHookPayload,
  isEditTool,
  readSessionTier,
  shouldRunGrillPretool,
  spawnHook
} from "./bridge.js";

const injectedSessions = new Set<string>();

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(pluginRoot, "hooks");
const skillsDir = path.join(pluginRoot, "skills");

function sessionIdFromMessages(
  messages: { info: { sessionID?: string; role?: string } }[]
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const id = messages[i]?.info?.sessionID;
    if (id) return id;
  }
  return "unknown";
}

function injectBootstrapOnce(
  messages: { info: { role?: string; sessionID?: string }; parts: { type?: string; text?: string }[] }[],
  sessionId: string
): void {
  if (injectedSessions.has(sessionId)) return;

  for (const message of messages) {
    if (message.info?.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string") {
        part.text = `${BOOTSTRAP_TEXT}\n\n${part.text}`;
        injectedSessions.add(sessionId);
        return;
      }
    }
  }
}

function createHooks(ctx: PluginInput): Hooks {
  const cwd = ctx.directory ?? ctx.worktree ?? process.cwd();

  return {
    config: async (input) => {
      const cfg = input as typeof input & { skills?: { paths?: string[] } };
      cfg.skills ??= { paths: [] };
      cfg.skills.paths ??= [];
      if (!cfg.skills.paths.includes(skillsDir)) {
        cfg.skills.paths.push(skillsDir);
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      const sessionId = sessionIdFromMessages(output.messages);
      injectBootstrapOnce(output.messages, sessionId);
    },

    "tool.execute.before": async (input, output) => {
      if (!isEditTool(input.tool)) return;
      if (!shouldRunGrillPretool(input.sessionID, cwd)) return;

      const payload = buildHookPayload({
        sessionID: input.sessionID,
        cwd,
        tool: input.tool,
        args: output.args
      });

      const result = spawnHook(hooksDir, "grill-pretool.sh", payload);
      if (result.exitCode === 2) {
        const reason = result.stderr.trim() || result.blockReason || "grill-pretool blocked this edit";
        throw new Error(reason);
      }
    },

    "tool.execute.after": async (input, output) => {
      if (!isEditTool(input.tool)) return;

      const payload = buildHookPayload({
        sessionID: input.sessionID,
        cwd,
        tool: input.tool,
        args: input.args
      });

      const result = spawnHook(hooksDir, "write-quality-lint.sh", payload);
      if (result.additionalContext) {
        output.output = `${output.output ?? ""}\n${result.additionalContext}`.trim();
      }
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") return;

      const props = (event as { properties?: Record<string, unknown> }).properties ?? {};
      const sessionID =
        (typeof props.sessionID === "string" && props.sessionID) ||
        (typeof props.id === "string" && props.id) ||
        "";

      if (!sessionID) return;

      const payload = buildHookPayload({
        sessionID,
        cwd,
        stopHookActive: false
      });

      const result = spawnHook(hooksDir, "verification-gate.sh", payload);
      const reminder = result.blockReason ?? result.additionalContext;
      if (!reminder) return;

      const tier = readSessionTier(sessionID, cwd);
      const text = `[do-it verification-gate${tier ? ` · ${tier}` : ""}] ${reminder}`;

      const client = ctx.client as unknown as {
        tui?: { showToast?: (input: { message: string; variant?: string }) => Promise<unknown> };
        session?: { notify?: (input: { sessionID: string; message: string }) => Promise<unknown> };
      };

      if (client.tui?.showToast) {
        await client.tui.showToast({ message: text, variant: "warning" }).catch(() => undefined);
        return;
      }

      if (client.session?.notify) {
        await client.session.notify({ sessionID, message: text }).catch(() => undefined);
      }
    }
  };
}

const plugin: Plugin = async (ctx) => createHooks(ctx);

export default plugin;
export { plugin as DoItOpencodePlugin, injectedSessions };
