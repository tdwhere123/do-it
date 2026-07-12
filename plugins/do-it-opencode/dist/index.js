import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_TEXT } from "./bootstrap.js";
import { buildHookPayload, isEditTool, normalizeToolName, readSessionTier, spawnHook } from "./bridge.js";
const injectedSessions = new Set();
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(pluginRoot, "hooks");
const skillsDir = path.join(pluginRoot, "skills");
function sessionIdFromMessages(messages) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const id = messages[i]?.info?.sessionID;
        if (id)
            return id;
    }
    return "unknown";
}
function injectBootstrapOnce(messages, sessionId) {
    if (injectedSessions.has(sessionId))
        return;
    for (const message of messages) {
        if (message.info?.role !== "user")
            continue;
        for (const part of message.parts) {
            if (part.type === "text" && typeof part.text === "string") {
                part.text = `${BOOTSTRAP_TEXT}\n\n${part.text}`;
                injectedSessions.add(sessionId);
                return;
            }
        }
    }
}
function appendContext(parts, context) {
    const firstText = parts.find((part) => part.type === "text" && typeof part.text === "string");
    if (firstText?.text !== undefined) {
        firstText.text = `${context}\n\n${firstText.text}`;
    }
}
function writeOpenCodeTranscript(sessionId, cwd, data) {
    const base = process.env.OPENCODE_DATA ?? path.join(cwd, ".opencode");
    const dir = path.join(base, "do-it-transcripts");
    const messages = data.data ?? [];
    const normalizeTool = (name) => normalizeToolName(name) ?? name;
    const records = messages.flatMap((raw) => {
        const message = raw;
        if (message.type === "user" && typeof message.text === "string") {
            return [{ type: "user", message: { content: [{ type: "text", text: message.text }] } }];
        }
        if (message.type === "shell" && typeof message.command === "string") {
            return [{ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: message.command } }] } }];
        }
        if (message.type !== "assistant")
            return [];
        const content = [];
        for (const part of message.content ?? []) {
            if (part.type === "text" && typeof part.text === "string") {
                content.push({ type: "text", text: part.text });
            }
            else if (part.type === "tool" && typeof part.name === "string") {
                content.push({ type: "tool_use", name: normalizeTool(part.name), input: part.state?.input ?? {} });
            }
        }
        return content.length ? [{ type: "assistant", message: { content } }] : [];
    });
    try {
        fs.mkdirSync(dir, { recursive: true });
        const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
        fs.writeFileSync(transcriptPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
        return transcriptPath;
    }
    catch {
        return null;
    }
}
function createHooks(ctx) {
    const cwd = ctx.directory ?? ctx.worktree ?? process.cwd();
    return {
        config: async (input) => {
            const cfg = input;
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
        "chat.message": async (input, output) => {
            const prompt = output.parts
                .filter((part) => part.type === "text" && "text" in part)
                .map((part) => part.text)
                .filter((text) => typeof text === "string")
                .join("\n");
            if (!prompt)
                return;
            const payload = JSON.stringify({ session_id: input.sessionID, cwd, prompt });
            const router = spawnHook(hooksDir, "router.sh", JSON.parse(payload));
            if (router.additionalContext)
                appendContext(output.parts, router.additionalContext);
            const grill = spawnHook(hooksDir, "grill-prompt.sh", JSON.parse(payload));
            if (grill.additionalContext)
                appendContext(output.parts, grill.additionalContext);
        },
        "tool.execute.after": async (input, output) => {
            if (!isEditTool(input.tool))
                return;
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
            if (event.type !== "session.idle")
                return;
            const props = event.properties ?? {};
            const sessionID = (typeof props.sessionID === "string" && props.sessionID) ||
                (typeof props.id === "string" && props.id) ||
                "";
            if (!sessionID)
                return;
            const client = ctx.client;
            const response = client.session?.messages
                ? await client.session.messages({ sessionID, limit: 400, order: "asc" }).catch(() => null)
                : null;
            const transcriptPath = response ? writeOpenCodeTranscript(sessionID, cwd, response) : null;
            if (!transcriptPath)
                return;
            const payload = buildHookPayload({
                sessionID,
                cwd,
                transcriptPath,
                stopHookActive: false
            });
            const result = spawnHook(hooksDir, "verification-gate.sh", payload);
            const reminder = result.blockReason ?? result.additionalContext;
            if (!reminder)
                return;
            const tier = readSessionTier(sessionID, cwd);
            const text = `[do-it verification-gate${tier ? ` · ${tier}` : ""}] ${reminder}`;
            const notifier = ctx.client;
            if (notifier.tui?.showToast) {
                await notifier.tui.showToast({ message: text, variant: "warning" }).catch(() => undefined);
                return;
            }
            if (notifier.session?.notify) {
                await notifier.session.notify({ sessionID, message: text }).catch(() => undefined);
            }
        }
    };
}
const plugin = async (ctx) => createHooks(ctx);
export default plugin;
export { plugin as DoItOpencodePlugin, injectedSessions, writeOpenCodeTranscript };
