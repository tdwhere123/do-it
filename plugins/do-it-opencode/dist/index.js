import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP_TEXT } from "./bootstrap.js";
import { buildHookPayload, isEditTool, normalizeToolName, readSessionTier, spawnHook, terminateActiveProcesses } from "./bridge.js";
const injectedSessions = new Set();
const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = path.join(pluginRoot, "hooks");
const skillsDir = path.join(pluginRoot, "skills");
const agentsDir = path.join(pluginRoot, "agents");
const VERIFICATION_TEMP_PREFIX = "do-it-opencode-";
const VERIFICATION_TEMP_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_OWNER_FILE = ".do-it-verification-owner";
const VERIFICATION_OWNER_MARKER = "do-it-opencode-verification-v1\n";
const COMPLETION_PATTERN = /(完成|已修|通过|完工|\bdone\b|\bpassed\b|\bfixed\b|\ball set\b|it works|works now|successfully|\bVERIFIED\b|ready to merge|ship it|ready to (ship|publish))/i;
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
        for (const part of message.parts ?? []) {
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
    if (firstText) {
        firstText.text = `${context}\n\n${firstText.text ?? ""}`;
    }
    else {
        parts.push({ type: "text", text: context });
    }
}
function hookContext(result) {
    if (result.additionalContext)
        return result.additionalContext;
    if (!result.diagnostic)
        return undefined;
    return `<system-reminder>${result.diagnostic}</system-reminder>`;
}
export function safeSessionKey(sessionId) {
    return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
}
function verificationTempPattern() {
    return /^do-it-opencode-[a-f0-9]{12}-/;
}
function removeOwnedVerificationTemp(candidate) {
    const marker = path.join(candidate, VERIFICATION_OWNER_FILE);
    const markerStat = fs.lstatSync(marker);
    if (!markerStat.isFile() || markerStat.isSymbolicLink())
        return;
    if (fs.readFileSync(marker, "utf8") !== VERIFICATION_OWNER_MARKER)
        return;
    const transcript = path.join(candidate, "gate.jsonl");
    if (fs.existsSync(transcript)) {
        const transcriptStat = fs.lstatSync(transcript);
        if (!transcriptStat.isFile() || transcriptStat.isSymbolicLink())
            return;
        fs.rmSync(transcript);
    }
    fs.rmSync(marker);
    fs.rmSync(candidate, { recursive: true, force: true });
}
export function cleanupStaleVerificationTemps(tempParent = os.tmpdir(), now = Date.now(), ttlMs = VERIFICATION_TEMP_TTL_MS) {
    try {
        for (const entry of fs.readdirSync(tempParent, { withFileTypes: true })) {
            if (!entry.isDirectory() || !verificationTempPattern().test(entry.name))
                continue;
            const candidate = path.join(tempParent, entry.name);
            try {
                const stat = fs.lstatSync(candidate);
                if (!stat.isDirectory() || stat.isSymbolicLink() || now - stat.mtimeMs <= ttlMs)
                    continue;
                removeOwnedVerificationTemp(candidate);
            }
            catch {
                // Cleanup is best-effort and must never interrupt host lifecycle hooks.
            }
        }
    }
    catch {
        // The host temp directory may be unreadable or may disappear during shutdown.
    }
}
/** Split an already whitespace-normalized command on shell delimiters without `\s*` ReDoS. */
function splitCommandSegments(command) {
    const parts = [];
    let buf = "";
    for (let i = 0; i < command.length; i += 1) {
        const two = command.slice(i, i + 2);
        if (two === "&&" || two === "||") {
            if (buf.trim())
                parts.push(buf.trim());
            buf = "";
            i += 1;
            continue;
        }
        const ch = command[i];
        if (ch === ";" || ch === "|") {
            if (buf.trim())
                parts.push(buf.trim());
            buf = "";
            continue;
        }
        buf += ch;
    }
    if (buf.trim())
        parts.push(buf.trim());
    return parts;
}
/** Strip leading `env` / `KEY=VAL` prefixes with a linear scan (no nested quantifiers). */
function stripLeadingEnvAssignments(segment) {
    let rest = segment.trim();
    if (rest.toLowerCase().startsWith("env "))
        rest = rest.slice(4).trimStart();
    while (rest.length > 0) {
        const eq = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
        if (!eq)
            break;
        let i = eq[0].length;
        const quote = rest[i];
        if (quote === '"' || quote === "'") {
            i += 1;
            while (i < rest.length && rest[i] !== quote)
                i += 1;
            if (i < rest.length)
                i += 1;
        }
        else {
            while (i < rest.length && !/[\s;|&]/.test(rest[i]))
                i += 1;
        }
        rest = rest.slice(i).trimStart();
    }
    return rest;
}
function tokensIncludeKeyword(tokens, keywords) {
    for (const token of tokens) {
        const lower = token.toLowerCase();
        for (const keyword of keywords) {
            if (lower === keyword || lower.includes(keyword))
                return true;
        }
    }
    return false;
}
function evidenceCommand(command) {
    if (typeof command !== "string")
        return null;
    // Collapse whitespace once so segment matchers stay linear-time.
    const normalizedCommand = command.replace(/[\t\n\r ]+/g, " ").trim();
    if (!normalizedCommand)
        return null;
    const runners = new Set(["vitest", "jest", "playwright", "pytest", "mypy", "tsc", "eslint", "ruff", "biome", "prettier"]);
    for (let segment of splitCommandSegments(normalizedCommand)) {
        segment = stripLeadingEnvAssignments(segment);
        if (segment.toLowerCase().startsWith("command "))
            segment = segment.slice(8).trimStart();
        const tokens = segment.split(" ").filter(Boolean);
        if (tokens.length === 0)
            continue;
        const head = tokens[0].toLowerCase();
        const arg1 = (tokens[1] ?? "").toLowerCase();
        if (head === "npm" && (arg1 === "test" || arg1 === "run" || arg1 === "exec"))
            return `npm ${arg1}`;
        if ((head === "pnpm" || head === "yarn") && (arg1 === "test" || arg1 === "build" || arg1 === "exec" || arg1 === "run")) {
            return `${head} ${arg1}`;
        }
        if (runners.has(head))
            return head;
        if (head === "cargo" && (arg1 === "test" || arg1 === "run" || arg1 === "build" || arg1 === "check" || arg1 === "clippy")) {
            return `cargo ${arg1}`;
        }
        if (head === "go" && (arg1 === "test" || arg1 === "run" || arg1 === "build" || arg1 === "vet"))
            return `go ${arg1}`;
        if (head === "do-it" && arg1 === "doctor")
            return "do-it doctor";
        if (head === "git" && arg1 === "diff")
            return "git diff";
        if (head === "node" && tokensIncludeKeyword(tokens.slice(1), ["validate", "check", "test", "build"])) {
            return "node validation";
        }
        if ((head === "python" || head === "python3") && tokensIncludeKeyword(tokens.slice(1), ["test", "check", "validate"])) {
            return "python validation";
        }
    }
    return null;
}
function toolStatus(part) {
    if (part.state?.status === "completed")
        return "completed";
    if (part.state?.status === "error")
        return "error";
    return "unknown";
}
function gateText(messages) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.info?.role !== "assistant")
            continue;
        const text = (messages[i].parts ?? [])
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n");
        if (/\bNOT_VERIFIED\b/i.test(text))
            return "NOT_VERIFIED";
        if (COMPLETION_PATTERN.test(text))
            return "Done.";
        return null;
    }
    return null;
}
/** True when idle should not silently skip: edits + completion language, or unusable payload. */
export function sessionNeedsVerificationReminder(data) {
    const rawMessages = data?.data;
    if (!Array.isArray(rawMessages))
        return true;
    const messages = rawMessages;
    let hasEdit = false;
    let hasCompletion = false;
    for (const message of messages) {
        if (message.info?.role !== "assistant")
            continue;
        for (const part of message.parts ?? []) {
            if (part.type !== "tool")
                continue;
            if (isEditTool(part.tool ?? part.name ?? ""))
                hasEdit = true;
        }
        const text = (message.parts ?? [])
            .filter((part) => part.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join("\n");
        if (COMPLETION_PATTERN.test(text))
            hasCompletion = true;
    }
    return hasEdit && hasCompletion;
}
function verificationRecords(data) {
    const rawMessages = data.data;
    if (!Array.isArray(rawMessages))
        return [];
    const messages = rawMessages;
    let currentTurnStart = -1;
    let hasAssistantAfterTurnStart = false;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.info?.role === "assistant") {
            hasAssistantAfterTurnStart = true;
            continue;
        }
        if (messages[i]?.info?.role === "user" && hasAssistantAfterTurnStart) {
            currentTurnStart = i;
            break;
        }
    }
    if (currentTurnStart < 0)
        return [];
    const records = [
        { type: "user", message: { content: [] } }
    ];
    let fallbackCallID = 0;
    for (const message of messages.slice(currentTurnStart + 1)) {
        if (message.info?.role !== "assistant")
            continue;
        for (const part of message.parts ?? []) {
            if (part.type !== "tool")
                continue;
            const rawTool = part.tool ?? part.name;
            if (!rawTool)
                continue;
            const normalized = normalizeToolName(rawTool);
            const isShell = rawTool.toLowerCase() === "bash" || rawTool.toLowerCase() === "shell";
            if (!normalized && !isShell)
                continue;
            if (normalized && part.state?.status !== "completed")
                continue;
            const name = normalized ?? "Bash";
            const command = isShell && part.state?.status === "completed"
                ? evidenceCommand(part.state.input?.command)
                : undefined;
            const input = command ? { command } : {};
            fallbackCallID += 1;
            const callID = part.callID ?? `${name.toLowerCase()}-${fallbackCallID}`;
            records.push({
                type: "assistant",
                message: { content: [{ type: "tool_use", id: callID, name, input }] }
            });
            records.push({
                type: "user",
                message: {
                    content: [{ type: "tool_result", tool_use_id: callID, status: toolStatus(part) }]
                }
            });
        }
    }
    const completion = gateText(messages.slice(currentTurnStart + 1));
    if (completion) {
        records.push({
            type: "assistant",
            message: { content: [{ type: "text", text: completion }] }
        });
    }
    return records;
}
export function createVerificationTranscript(sessionId, data, options = {}) {
    const records = verificationRecords(data);
    if (records.length === 0)
        return null;
    const tempParent = options.tempParent ?? os.tmpdir();
    let dir;
    try {
        cleanupStaleVerificationTemps(tempParent);
        dir = fs.mkdtempSync(path.join(tempParent, `${VERIFICATION_TEMP_PREFIX}${safeSessionKey(sessionId)}-`));
        fs.chmodSync(dir, 0o700);
        fs.writeFileSync(path.join(dir, VERIFICATION_OWNER_FILE), VERIFICATION_OWNER_MARKER, {
            encoding: "utf8",
            mode: 0o600,
            flag: "wx"
        });
        const transcriptPath = path.join(dir, "gate.jsonl");
        fs.writeFileSync(transcriptPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
        const cleanupDir = dir;
        return {
            path: transcriptPath,
            cleanup: () => fs.rmSync(cleanupDir, { recursive: true, force: true })
        };
    }
    catch {
        if (dir)
            fs.rmSync(dir, { recursive: true, force: true });
        return null;
    }
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
async function notify(ctx, message) {
    await ctx.client.tui.showToast({
        body: { message, variant: "warning" },
        query: { directory: ctx.directory }
    }).catch(() => undefined);
}
function sessionIdFromDeletedEvent(event) {
    const candidate = event;
    if (candidate.type !== "session.deleted")
        return null;
    return typeof candidate.properties?.info?.id === "string" ? candidate.properties.info.id : null;
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
        "experimental.chat.messages.transform": async (_input, output) => {
            const messages = output.messages;
            injectBootstrapOnce(messages, sessionIdFromMessages(messages));
        },
        "chat.message": async (input, output) => {
            const prompt = output.parts
                .filter((part) => part.type === "text" && "text" in part)
                .map((part) => part.text)
                .filter((text) => typeof text === "string")
                .join("\n");
            if (!prompt)
                return;
            const payload = { session_id: input.sessionID, cwd, prompt };
            const contexts = new Set();
            for (const scriptName of ["router.sh", "grill-prompt.sh"]) {
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
        event: async ({ event }) => {
            const deletedSession = sessionIdFromDeletedEvent(event);
            if (deletedSession) {
                injectedSessions.delete(deletedSession);
                return;
            }
            if (event.type !== "session.idle")
                return;
            const props = event.properties ?? {};
            const sessionID = (typeof props.sessionID === "string" && props.sessionID) ||
                (typeof props.id === "string" && props.id) ||
                "";
            if (!sessionID)
                return;
            const response = await ctx.client.session.messages({
                path: { id: sessionID },
                query: { directory: cwd, limit: 400 }
            }).catch(() => null);
            if (!response) {
                const tier = readSessionTier(sessionID, cwd);
                await notify(ctx, `[do-it verification-gate${tier ? ` · ${tier}` : ""}] session messages unavailable; state NOT_VERIFIED`);
                return;
            }
            const transcript = createVerificationTranscript(sessionID, { data: response.data });
            if (!transcript) {
                if (sessionNeedsVerificationReminder({ data: response.data })) {
                    const tier = readSessionTier(sessionID, cwd);
                    await notify(ctx, `[do-it verification-gate${tier ? ` · ${tier}` : ""}] could not synthesize transcript for claim check; state NOT_VERIFIED`);
                }
                return;
            }
            try {
                const result = await spawnHook(hooksDir, "verification-gate.sh", buildHookPayload({
                    sessionID,
                    cwd,
                    transcriptPath: transcript.path,
                    stopHookActive: false
                }));
                const reminder = result.blockReason ?? result.additionalContext ?? result.diagnostic;
                if (!reminder)
                    return;
                const tier = readSessionTier(sessionID, cwd);
                await notify(ctx, `[do-it verification-gate${tier ? ` · ${tier}` : ""}] ${reminder}`);
            }
            finally {
                transcript.cleanup();
            }
        },
        dispose: async () => {
            injectedSessions.clear();
            cleanupStaleVerificationTemps();
            terminateActiveProcesses();
        }
    };
}
const plugin = async (ctx) => createHooks(ctx);
export default plugin;
export { plugin as DoItOpencodePlugin, injectedSessions };
