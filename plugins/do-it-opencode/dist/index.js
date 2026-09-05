import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookPayload, isEditTool, isEvidenceTool, spawnHook, terminateActiveProcesses } from "./bridge.js";
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(pluginRoot, "hooks");
const skillsDir = path.join(pluginRoot, "skills");
const agentsDir = path.join(pluginRoot, "agents");
function appendContext(parts, context) {
    const first = parts.find((part) => part.type === "text" && typeof part.text === "string");
    if (first)
        first.text = `${context}\n\n${first.text ?? ""}`;
    else
        parts.push({ type: "text", text: context });
}
function hookContext(result) {
    return result.additionalContext ?? (result.diagnostic ? `<system-reminder>${result.diagnostic}</system-reminder>` : undefined);
}
function parseAgentFile(filePath) {
    try {
        const source = fs.readFileSync(filePath, "utf8");
        const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match)
            return null;
        const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
        const rawDescription = match[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
        const description = rawDescription?.replace(/^(["'])(.*)\1$/, "$2");
        const prompt = match[2].trim();
        if (!name || !description || !prompt)
            return null;
        return { name, registration: { description, prompt, mode: "subagent" } };
    }
    catch {
        return null;
    }
}
function bundledAgents() {
    const result = new Map();
    try {
        for (const filename of fs.readdirSync(agentsDir).sort()) {
            if (!filename.endsWith(".md"))
                continue;
            const parsed = parseAgentFile(path.join(agentsDir, filename));
            if (parsed)
                result.set(parsed.name, parsed.registration);
        }
    }
    catch {
        // Missing optional bundle content does not prevent the rest of the plugin loading.
    }
    return result;
}
function createHooks(ctx) {
    const cwd = ctx.directory ?? ctx.worktree ?? process.cwd();
    const agents = bundledAgents();
    return {
        config: async (input) => {
            const cfg = input;
            cfg.skills ??= { paths: [] };
            cfg.skills.paths ??= [];
            if (!cfg.skills.paths.includes(skillsDir))
                cfg.skills.paths.push(skillsDir);
            cfg.agent ??= {};
            for (const [name, registration] of agents) {
                cfg.agent[name] ??= registration;
            }
        },
        "chat.message": async (input, output) => {
            const prompt = output.parts
                .filter((part) => part.type === "text" && "text" in part)
                .map((part) => part.text)
                .filter((text) => typeof text === "string")
                .join("\n");
            if (!prompt)
                return;
            const payload = buildHookPayload({
                sessionID: input.sessionID,
                cwd,
                model: input.model
                    ? `${input.model.providerID}/${input.model.modelID}`
                    : undefined,
                prompt
            });
            const contexts = new Set();
            const scriptNames = ["prompt-submit.sh"];
            for (const scriptName of scriptNames) {
                const result = await spawnHook(hooksDir, scriptName, payload);
                const context = hookContext(result);
                if (context)
                    contexts.add(context);
                if (result.unavailable)
                    break;
            }
            for (const context of contexts)
                appendContext(output.parts, context);
        },
        "tool.execute.after": async (input, output) => {
            if (process.env.DO_IT_EVIDENCE_MODE === "observe" && isEvidenceTool(input.tool)) {
                const metadata = output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
                    ? output.metadata
                    : undefined;
                await spawnHook(hooksDir, "evidence-observer.sh", buildHookPayload({
                    sessionID: input.sessionID,
                    cwd,
                    tool: input.tool,
                    args: input.args,
                    output: typeof output.output === "string" ? output.output : undefined,
                    metadata
                }));
            }
            if (!isEditTool(input.tool))
                return;
            const result = await spawnHook(hooksDir, "write-quality-lint.sh", buildHookPayload({
                sessionID: input.sessionID,
                cwd,
                tool: input.tool,
                args: input.args
            }));
            const context = hookContext(result);
            if (context)
                output.output = `${output.output ?? ""}\n${context}`.trim();
        },
        dispose: async () => { terminateActiveProcesses(); }
    };
}
const plugin = async (ctx) => createHooks(ctx);
export default plugin;
export { plugin as DoItOpencodePlugin };
